// Import order matters: leaf types before types that reference them, then
// queries, then build. Pothos executes each `builder.*Type` call at import time.

import { builder } from './builder.js';

// Leaf types
import './types/activity.js';
import './types/location.js';
import './types/score.js';

// Composite types
import './types/ranking.js';

// Errors + top-level union
import './types/errors.js';

// Query root
import './queries/activity-rankings.js';
import './queries/geocode.js';

export const schema = builder.toSchema();
