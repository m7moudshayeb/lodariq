import type { FastifyInstance } from 'fastify';
import type { ControlPlaneRouteOptions } from './control-plane-context';
import { registerControlPlaneThemeRoutes } from './control-plane-themes';
import { registerControlPlaneEnvironmentRoutes } from './control-plane-environments';
import { registerControlPlaneSdkInstallationRoutes } from './control-plane-sdk-installations';
import { registerControlPlaneEnvironmentTokenRoutes } from './control-plane-environment-tokens';
import { registerControlPlaneAnalyticsRoutes } from './control-plane-analytics';
import { registerControlPlaneGovernanceRoutes } from './control-plane-governance';
import { registerControlPlaneBillingRoutes } from './control-plane-billing';
import { registerControlPlaneAnalyticsWarehouseRoutes } from './control-plane-analytics-warehouse';
import { registerControlPlaneChangeHistoryRoutes } from './control-plane-change-history';
import { registerControlPlaneAccessibilityRoutes } from './control-plane-accessibility';
import { registerHealthAndCorsRoutes } from './control-plane/register-health-and-cors';
import { registerSdkBootstrapRoutes } from './control-plane/register-sdk-bootstrap';
import { registerSdkDeliveryRoutes } from './control-plane/register-sdk-delivery';
import { registerSdkAuthoringRoutes } from './control-plane/register-sdk-authoring';
import { registerSdkAuthoringOperationsRoutes } from './control-plane/register-sdk-authoring-operations';
import { registerDocumentRoutes } from './control-plane/register-documents';
import { registerDocumentReleaseRoutes } from './control-plane/register-document-releases';
import { registerReleaseReviewRoutes } from './control-plane/register-release-review';
import { registerAuthoringSessionRoutes } from './control-plane/register-authoring-sessions';
import { registerAuthoringDocumentRoutes } from './control-plane/register-authoring-documents';
import { registerAuthoringReleaseRoutes } from './control-plane/register-authoring-releases';
import { registerAuthoringResourceRoutes } from './control-plane/register-authoring-resources';
import { registerExperienceMeasurementRoutes } from './control-plane/register-experience-measurement';

const CONTROL_PLANE_ROUTE_REGISTRARS = [
  registerHealthAndCorsRoutes,
  registerSdkBootstrapRoutes,
  registerSdkDeliveryRoutes,
  registerSdkAuthoringRoutes,
  registerSdkAuthoringOperationsRoutes,
  registerDocumentRoutes,
  registerDocumentReleaseRoutes,
  registerReleaseReviewRoutes,
  registerControlPlaneThemeRoutes,
  registerControlPlaneEnvironmentRoutes,
  registerControlPlaneSdkInstallationRoutes,
  registerControlPlaneEnvironmentTokenRoutes,
  registerAuthoringSessionRoutes,
  registerAuthoringDocumentRoutes,
  registerAuthoringResourceRoutes,
  registerAuthoringReleaseRoutes,
  registerControlPlaneAnalyticsRoutes,
  registerControlPlaneGovernanceRoutes,
  registerControlPlaneBillingRoutes,
  registerControlPlaneAnalyticsWarehouseRoutes,
  registerControlPlaneChangeHistoryRoutes,
  registerControlPlaneAccessibilityRoutes,
  registerExperienceMeasurementRoutes,
] as const;

export function registerControlPlaneRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  for (const registerRoutes of CONTROL_PLANE_ROUTE_REGISTRARS) {
    registerRoutes(fastify, options);
  }
}
