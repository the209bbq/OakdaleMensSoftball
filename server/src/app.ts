import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LeagueStore } from './store.js';
import type { LandingContent, PublicUser, TeamAttendance } from './types.js';
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
  // Photos are stored as data:image URLs (up to 800000 chars), so the JSON
  // body limit has to be well above Express's 100kb default.
  app.use(express.json({ limit: '2mb' }));
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

  /** Admins can edit any team; managers only their assigned team. */
  const canManageTeam = (user: PublicUser | undefined, teamId: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.role === 'manager' && user.teamId === teamId;
  };

  /** Team members (any role on that team) and admins may read/post team chat. */
  const canAccessTeamChat = (user: PublicUser | undefined, teamId: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.teamId === teamId;
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

  api.put('/auth/profile', requireAuth, (req: Request, res: Response) => {
    try {
      const { name, position, number, photoUrl } = req.body ?? {};
      const updated = store.updateProfile(req.user!.id, { name, position, number, photoUrl });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.put('/auth/team', requireAuth, (req: Request, res: Response) => {
    if (req.user!.role !== 'player') {
      res.status(400).json({ error: 'Your team is managed by the league' });
      return;
    }
    const { teamId } = req.body ?? {};
    if (teamId !== null && typeof teamId !== 'string') {
      res.status(400).json({ error: 'teamId must be a string or null' });
      return;
    }
    try {
      const updated = store.setUserTeam(req.user!.id, teamId);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
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

  api.get('/current-week', (_req: Request, res: Response) => {
    res.json(store.getCurrentWeek());
  });

  api.get('/teams/:id/roster', (req: Request, res: Response) => {
    const team = store.getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    res.json({
      team,
      roster: store.getRoster(team.id),
      members: store.getTeamMembers(team.id),
      manager: store.getTeamManager(team.id),
      currentWeek: store.getCurrentWeek(),
    });
  });

  api.post('/checkin', requireAuth, (req: Request, res: Response) => {
    const week = Number((req.body ?? {}).week);
    const status = (req.body ?? {}).status;
    if (!Number.isInteger(week)) {
      res.status(400).json({ error: 'week is not a scheduled week' });
      return;
    }
    if (status !== 'in' && status !== 'out' && status !== null) {
      res.status(400).json({ error: "status must be 'in', 'out', or null" });
      return;
    }
    if (!req.user!.teamId) {
      res.status(400).json({ error: 'You must be on a team to check in' });
      return;
    }
    try {
      const next = store.setCheckIn(req.user!.id, week, status);
      res.json({ ok: true, week, status: next });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.get('/rules', (_req: Request, res: Response) => {
    res.json({ rules: store.getRules() });
  });

  // ---- Landing page (public read; admin write) --------------------------

  api.get('/landing', (_req: Request, res: Response) => {
    res.json(store.getLanding());
  });

  api.put('/landing', requireAdmin, (req: Request, res: Response) => {
    try {
      const { headline, body, imageUrl, countdownLabel, countdownTarget } = req.body ?? {};
      const payload: Partial<LandingContent> = {};
      if (headline !== undefined) payload.headline = headline;
      if (body !== undefined) payload.body = body;
      if (imageUrl !== undefined) payload.imageUrl = imageUrl;
      if (countdownLabel !== undefined) payload.countdownLabel = countdownLabel;
      if (countdownTarget !== undefined) payload.countdownTarget = countdownTarget;
      res.json(store.setLanding(payload));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ---- Suggestions (public submit; admin-only reads).
  // Routing suggestions to an external place (email/Slack) can be added later;
  // for now admins view them in-app.
  api.post('/suggestions', (req: Request, res: Response) => {
    try {
      const { text, name } = req.body ?? {};
      let authorName: string | null | undefined;
      if (typeof name === 'string') {
        authorName = name;
      } else if (req.user) {
        authorName = req.user.name;
      } else {
        authorName = null;
      }
      const suggestion = store.addSuggestion({ text, authorName });
      res.status(201).json(suggestion);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.get('/suggestions', requireAdmin, (_req: Request, res: Response) => {
    res.json(store.listSuggestions());
  });

  api.delete('/suggestions/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      store.deleteSuggestion(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      const message = (err as Error).message;
      if (message.startsWith('Unknown suggestion')) {
        res.status(404).json({ error: 'Suggestion not found' });
        return;
      }
      res.status(400).json({ error: message });
    }
  });

  // ---- Team group chat (team members + admins) --------------------------

  api.get('/teams/:id/messages', requireAuth, (req: Request, res: Response) => {
    const team = store.getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    if (!canAccessTeamChat(req.user, team.id)) {
      res.status(403).json({ error: 'You can only access your own team chat' });
      return;
    }
    res.json(store.getTeamMessages(team.id));
  });

  api.post('/teams/:id/messages', requireAuth, (req: Request, res: Response) => {
    const team = store.getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    if (!canAccessTeamChat(req.user, team.id)) {
      res.status(403).json({ error: 'You can only access your own team chat' });
      return;
    }
    try {
      const message = store.addTeamMessage({
        teamId: team.id,
        userId: req.user!.id,
        authorName: req.user!.name,
        text: (req.body ?? {}).text,
      });
      res.status(201).json(message);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
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

  // ---- Team management (admin creates; admin or the team's manager edits) --

  api.post('/teams', requireAdmin, (req: Request, res: Response) => {
    try {
      const team = store.createTeam((req.body ?? {}).name);
      res.status(201).json(team);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.put('/teams/:id', requireAuth, (req: Request, res: Response) => {
    if (!store.getTeam(req.params.id)) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    if (!canManageTeam(req.user, req.params.id)) {
      res.status(403).json({ error: 'You can only manage your own team' });
      return;
    }
    try {
      const team = store.renameTeam(req.params.id, (req.body ?? {}).name);
      res.json(team);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.put('/teams/:id/photo', requireAuth, (req: Request, res: Response) => {
    if (!store.getTeam(req.params.id)) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    if (!canManageTeam(req.user, req.params.id)) {
      res.status(403).json({ error: 'You can only manage your own team' });
      return;
    }
    try {
      const { photoUrl } = req.body ?? {};
      const team = store.setTeamPhoto(req.params.id, photoUrl ?? null);
      res.json(team);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ---- Roster management (admin or the team's manager) ------------------

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

  // ---- Score reporting (admin, or a manager of one of the two teams) ----

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

  api.get('/members', requireAuth, (req: Request, res: Response) => {
    if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
      res.status(403).json({ error: 'Admin or team manager access required' });
      return;
    }
    res.json(store.listPlayerAccounts());
  });

  api.post('/users/:id/team', requireAuth, (req: Request, res: Response) => {
    const target = store.getUserById(req.params.id);
    if (!target) {
      res.status(400).json({ error: 'Unknown user' });
      return;
    }
    if (target.role !== 'player') {
      res.status(400).json({ error: 'Only player accounts can be assigned to a team' });
      return;
    }
    const { teamId } = req.body ?? {};
    if (teamId !== null && typeof teamId !== 'string') {
      res.status(400).json({ error: 'teamId must be a string or null' });
      return;
    }

    const actor = req.user!;
    if (actor.role === 'admin') {
      // Admins may assign a player to any team (or none).
    } else if (actor.role === 'manager') {
      const ownTeam = actor.teamId;
      if (!ownTeam) {
        res.status(403).json({ error: 'You can only manage your own team' });
        return;
      }
      const addingToOwn = teamId === ownTeam;
      const removingFromOwn = teamId === null && target.teamId === ownTeam;
      if (!addingToOwn && !removingFromOwn) {
        res.status(403).json({ error: 'You can only add or remove players on your own team' });
        return;
      }
    } else {
      res.status(403).json({ error: 'Admin or team manager access required' });
      return;
    }

    try {
      const updated = store.setUserTeam(target.id, teamId);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.get('/users', requireAdmin, (_req: Request, res: Response) => {
    res.json(store.listUsers());
  });

  api.post('/users/:id/role', requireAdmin, (req: Request, res: Response) => {
    try {
      const { role, teamId } = req.body ?? {};
      if (!['admin', 'manager', 'player'].includes(role)) {
        res.status(400).json({ error: 'role must be admin, manager, or player' });
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

  // ---- Manager email authorizations (admin only) ------------------------

  api.get('/manager-emails', requireAdmin, (_req: Request, res: Response) => {
    res.json(store.listManagerAuthorizations());
  });

  api.post('/manager-emails', requireAdmin, (req: Request, res: Response) => {
    const { emails, teamId } = req.body ?? {};
    if (typeof teamId !== 'string' || !teamId) {
      res.status(400).json({ error: 'teamId is required' });
      return;
    }
    if (!store.getTeam(teamId)) {
      res.status(400).json({ error: `Unknown team: ${teamId}` });
      return;
    }
    const parsed = parseEmails(emails);
    if (parsed.length === 0) {
      res.status(400).json({ error: 'At least one valid-looking email is required' });
      return;
    }
    try {
      res.json(store.authorizeManagers(parsed, teamId));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.delete('/manager-emails/:email', requireAdmin, (req: Request, res: Response) => {
    let email = req.params.email ?? '';
    try {
      email = decodeURIComponent(email);
    } catch {
      // already decoded
    }
    res.json(store.revokeManagerAuthorization(email));
  });

  // ---- TEST DATA (simulation, admin only) --------------------------------

  api.post('/admin/test-data/generate', requireAdmin, (_req: Request, res: Response) => {
    try {
      const summary = store.generateTestData();
      if (summary.alreadySeeded) {
        res.status(409).json({ error: 'Test data already seeded', ...summary });
        return;
      }
      res.json(summary);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.post('/admin/test-data/clear', requireAdmin, (_req: Request, res: Response) => {
    try {
      res.json(store.clearTestData());
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

const EMPTY_ATTENDANCE: TeamAttendance = { in: 0, out: 0, none: 0, total: 0 };

function withTeamNames(store: LeagueStore) {
  const teams = new Map(store.getTeams().map((t) => [t.id, t.name]));
  const games = store.getSchedule();
  const attendance = store.getAttendanceForGames(games);
  return games.map((g) => ({
    ...g,
    homeTeamName: teams.get(g.homeTeamId) ?? g.homeTeamId,
    awayTeamName: teams.get(g.awayTeamId) ?? g.awayTeamId,
    homeAttendance: attendance.get(`${g.homeTeamId}:${g.week}`) ?? EMPTY_ATTENDANCE,
    awayAttendance: attendance.get(`${g.awayTeamId}:${g.week}`) ?? EMPTY_ATTENDANCE,
  }));
}

/** Split a string or string[] of emails on commas / whitespace / newlines. */
function parseEmails(input: unknown): string[] {
  const chunks: string[] = [];
  if (typeof input === 'string') {
    chunks.push(input);
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') chunks.push(item);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of chunks) {
    for (const part of chunk.split(/[\s,]+/)) {
      const email = part.trim().toLowerCase();
      if (!email) continue;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}
