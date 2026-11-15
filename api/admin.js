// POST /api/admin  { password, action: 'list' | 'delete' | 'reset', board, id?, kind? }  (see lib/lb.js)
import { adminHandler } from '../lib/lb.js';
export default adminHandler;
