import { RouterProvider, createBrowserRouter } from 'react-router';
import { LandingPage } from '../features/landing/landing.page.js';
import { RankingPage } from '../features/ranking/ranking.page.js';

/**
 * Route table. `/city/:name` is URL-encoded (see spec 05 §Routing) —
 * `encodeURIComponent(city)` at the call site.
 */
const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/city/:name', element: <RankingPage /> },
]);

export function AppRoutes() {
  return <RouterProvider router={router} />;
}
