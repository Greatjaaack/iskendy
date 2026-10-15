import { createContext, useContext } from 'react';
import { guestSignals } from '../platform/guest-signals';
export const GuestSignalsContext = createContext(guestSignals);
export const useGuestSignals = () => useContext(GuestSignalsContext);
