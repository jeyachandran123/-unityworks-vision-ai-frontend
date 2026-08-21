/**
 * The DevTools route table — the entire lazy chunk.
 *
 * Default-exported and imported exactly once, by `React.lazy` in `AppRouter`.
 * That single door is what keeps the permission gate in one place and keeps the
 * engineering bundle out of a restaurant manager's browser.
 */

import { Route, Routes } from 'react-router-dom';
import DevToolsLayout from './DevToolsLayout';
import {
  AttributesScreen,
  ComplianceScreen,
  CropsScreen,
  DetectionScreen,
  DiagnosticsScreen,
  EconomyScreen,
  EvidenceScreen,
  FramesScreen,
  ModelCallsScreen,
  ObservationsScreen,
  OverviewScreen,
  SessionsScreen,
  SourcesScreen,
  TrackingScreen,
  VisionStateScreen,
} from './screens';

export default function DevToolsRoutes() {
  return (
    <Routes>
      <Route element={<DevToolsLayout />}>
        <Route index element={<OverviewScreen />} />
        <Route path="sessions" element={<SessionsScreen />} />
        <Route path="sources" element={<SourcesScreen />} />
        <Route path="diagnostics" element={<DiagnosticsScreen />} />

        <Route path="frames" element={<FramesScreen />} />
        <Route path="perception/detection" element={<DetectionScreen />} />
        <Route path="perception/tracking" element={<TrackingScreen />} />

        <Route path="understanding/crops" element={<CropsScreen />} />
        <Route path="understanding/vlm" element={<ModelCallsScreen />} />
        <Route path="understanding/attributes" element={<AttributesScreen />} />

        <Route path="state" element={<VisionStateScreen />} />
        <Route path="state/observations" element={<ObservationsScreen />} />
        <Route path="compliance" element={<ComplianceScreen />} />

        <Route path="evidence" element={<EvidenceScreen />} />
        <Route path="economy" element={<EconomyScreen />} />
      </Route>
    </Routes>
  );
}
