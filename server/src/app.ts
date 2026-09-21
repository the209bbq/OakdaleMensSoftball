import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LeagueStore } from './store.js';
import type { PublicUser } from './types.js';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  createSessionToken,
  verifySessionToken,
} from './auth.js';

export interface AppOptions {
  clientDist?: string;
  sessionSecret?: string;
  secureCookies?: boolean;
}

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

export function createApp(store: LeagueStore, options: AppOptions = {}): Express {
  const sessionSecret = options.sessionSecret ?? 'dev-insecure-secret-change-me';
  const secureCookies = options.secureCookies ?? false;

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // Attach the current user (if any) to every request.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      const uid = verifySessionToken(token, sessionSecret);
      if (uid) {
        const user = store.getUserById(uid);
        if (user) req.user = store.toPublicUser(user);
      }
    }
    next();
  });

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'You must be signed in' });
      return;
    }
    next();
  };

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'You must be signed in' });
      return;
    }
    if (req.user.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  };

  /** Admins can edit any team; captains only their assigned team. */
  const canManageTeam = (user: PublicUser | undefined, teamId: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.role === 'captain' && user.teamId === teamId;
  };

  const setSessionCookie = (res: Response, userId: string) => {
    res.cookie(SESSION_COOKIE, createSessionToken(userId, sessionSecret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      maxAge: SESSION_MAX_AGE_MS,
    });
  };

  const api = express.Router();

  api.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', league: 'Oakdale Men\'s Softball' });
  });

  // ---- Auth --------------------------------------------------------------

  api.post('/auth/register', (req: Request, res: Response) => {
    try {
      const { email, name, password } = req.body ?? {};
      const user = store.registerUser({ email, name, password });
      setSessionCookie(res, user.id);
      res.status(201).json(user);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.post('/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    const user = store.authenticate(email, password);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    setSessionCookie(res, user.id);
    res.json(user);
  });

  api.post('/auth/logout', (_req: Request, res: Response) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  api.get('/auth/me', (req: Request, res: Response) => {
    res.json({ user: req.user ?? null });
  });

  // ---- Public reads ------------------------------------------------------

  api.get('/teams', (_req: Request, res: Response) => {
    res.json(store.getTeams());
  });

  api.get('/standings', (_req: Request, res: Response) => {
    res.json(store.getStandings());
  });

  api.get('/schedule', (_req: Request, res: Response) => {
    res.json(withTeamNames(store));
  });

  api.get('/teams/:id/roster', (req: Request, res: Response) => {
    const team = store.getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    res.json({ team, roster: store.getRoster(team.id) });
  });

  api.get('/rules', (_req: Request, res: Response) => {
    res.json({ rules: store.getRules() });
  });

  // ---- Rules management (admin only) ------------------------------------

  api.put('/rules', requireAdmin, (req: Request, res: Response) => {
    const { rules } = req.body ?? {};
    if (typeof rules !== 'string') {
      res.status(400).json({ error: 'rules must be a string' });
      return;
    }
    if (rules.length > 20000) {
      res.status(400).json({ error: 'rules must be 20000 characters or fewer' });
      return;
    }
    res.json({ rules: store.setRules(rules) });
  });

  // ---- Team management (admin) ------------------------------------------

  api.post('/teams', requireAdmin, (req: Request, res: Response) => {
    try {
      const team = store.createTeam((req.body ?? {}).name);
      res.status(201).json(team);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.put('/teams/:id', requireAdmin, (req: Request, res: Response) => {
    if (!store.getTeam(req.params.id)) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    try {
      const team = store.renameTeam(req.params.id, (req.body ?? {}).name);
      res.json(team);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ---- Roster management (admin or the team's captain) ------------------

  api.post('/players', requireAuth, (req: Request, res: Response) => {
    try {
      const { teamId, name, number, position } = req.body ?? {};
      if (!canManageTeam(req.user, teamId)) {
        res.status(403).json({ error: 'You can only manage your own team' });
        return;
      }
      const player = store.addPlayer({ teamId, name, number, position });
      res.status(201).json(player);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.delete('/players/:id', requireAuth, (req: Request, res: Response) => {
    const player = store.getPlayer(req.params.id);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    if (!canManageTeam(req.user, player.teamId)) {
      res.status(403).json({ error: 'You can only manage your own team' });
      return;
    }
    store.removePlayer(player.id);
    res.json({ ok: true });
  });

  // ---- Schedule generation (admin only) ---------------------------------

  api.post('/schedule/generate', requireAdmin, (req: Request, res: Response) => {
    try {
      const { startDate, weeks } = req.body ?? {};
      if (startDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) {
        res.status(400).json({ error: 'startDate must be a YYYY-MM-DD date' });
        return;
      }
      let weekCount: number | undefined;
      if (weeks !== undefined && weeks !== null && weeks !== '') {
        const n = Number(weeks);
        if (!Number.isInteger(n) || n < 1 || n > 30) {
          res.status(400).json({ error: 'weeks must be a positive integer ≤ 30' });
          return;
        }
        weekCount = n;
      }
      store.generateSchedule({ startDate, weeks: weekCount });
      res.status(201).json(withTeamNames(store));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ---- Score reporting (admin, or a captain of one of the two teams) ----

  api.post('/games/:id/result', requireAuth, (req: Request, res: Response) => {
    try {
      const game = store.getGame(req.params.id);
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }
      const allowed = canManageTeam(req.user, game.homeTeamId) || canManageTeam(req.user, game.awayTeamId);
      if (!allowed) {
        res.status(403).json({ error: 'You can only report scores for your own games' });
        return;
      }
      const { homeScore, awayScore } = req.body ?? {};
      const updated = store.recordResult(req.params.id, Number(homeScore), Number(awayScore));
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ---- User & role management (admin only) ------------------------------

  api.get('/users', requireAdmin, (_req: Request, res: Response) => {
    res.json(store.listUsers());
  });

  api.post('/users/:id/role', requireAdmin, (req: Request, res: Response) => {
    try {
      const { role, teamId } = req.body ?? {};
      if (!['admin', 'captain', 'member'].includes(role)) {
        res.status(400).json({ error: 'role must be admin, captain, or member' });
        return;
      }
      if (req.params.id === req.user!.id && role !== 'admin') {
        res.status(400).json({ error: 'You cannot remove your own admin access' });
        return;
      }
      const updated = store.setUserRole(req.params.id, role, teamId ?? null);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.use('/api', api);

  const dist = options.clientDist;
  if (dist && existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(join(dist, 'index.html'));
    });
  }

  return app;
}

function withTeamNames(store: LeagueStore) {
  const teams = new Map(store.getTeams().map((t) => [t.id, t.name]));
  return store.getSchedule().map((g) => ({
    ...g,
    homeTeamName: teams.get(g.homeTeamId) ?? g.homeTeamId,
    awayTeamName: teams.get(g.awayTeamId) ?? g.awayTeamId,
  }));
}
