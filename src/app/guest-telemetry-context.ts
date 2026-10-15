import { createContext, useContext } from 'react';
import { guestTelemetry } from '../platform/guest-telemetry';
export const GuestTelemetryContext = createContext(guestTelemetry);
export const useGuestTelemetry = () => useContext(GuestTelemetryContext);
