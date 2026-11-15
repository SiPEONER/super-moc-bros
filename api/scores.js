// GET /api/scores?board=booth|online  ->  { board, score: [...top 10], time: [...top 10] }
// POST /api/scores  { board, id, initials, score, frames, key? }  (see lib/lb.js)
import { scoresHandler } from '../lib/lb.js';
export default scoresHandler;
