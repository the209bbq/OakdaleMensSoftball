import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LeagueStore } from './store.js';

export function createApp(store: LeagueStore, clientDist?: string): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const api = express.Router();

  api.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', league: 'Oakdale Men\'s Softball' });
  });

  api.get('/teams', (_req: Request, res: Response) => {
    res.json(store.getTeams());
  });

  api.get('/standings', (_req: Request, res: Response) => {
    res.json(store.getStandings());
  });

  api.get('/schedule', (_req: Request, res: Response) => {
    const teams = new Map(store.getTeams().map((t) => [t.id, t.name]));
    const schedule = store.getSchedule().map((g) => ({
      ...g,
      homeTeamName: teams.get(g.homeTeamId) ?? g.homeTeamId,
      awayTeamName: teams.get(g.awayTeamId) ?? g.awayTeamId,
    }));
    res.json(schedule);
  });

  api.get('/teams/:id/roster', (req: Request, res: Response) => {
    const team = store.getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    res.json({ team, roster: store.getRoster(team.id) });
  });

  api.post('/players', (req: Request, res: Response) => {
    try {
      const { teamId, name, number, position } = req.body ?? {};
      const player = store.addPlayer({ teamId, name, number, position });
      res.status(201).json(player);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  api.post('/games/:id/result', (req: Request, res: Response) => {
    try {
      const { homeScore, awayScore } = req.body ?? {};
      const game = store.recordResult(req.params.id, Number(homeScore), Number(awayScore));
      res.json(game);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.use('/api', api);

  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  return app;
}
