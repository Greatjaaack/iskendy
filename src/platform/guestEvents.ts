import { sendGuestEvent, type GuestStep } from '../api/endpoints/guest';
import { guestOrderStorage as orderStorage } from '../storage/guestOrderStorage';
export function createGuestEvents(
  storage: Pick<
    typeof orderStorage,
    'readOrder' | 'guestId' | 'visitId'
  > = orderStorage,
  send = sendGuestEvent,
) {
  const sent = new Set<GuestStep>();
  let visit = '';

  return (step: GuestStep, number?: number): void => {
    const session = storage.visitId();
    if (session !== visit) {
      sent.clear();
      visit = session;
    }
    const repeated = step === 'sub_try' || step === 'sub_fail';
    if (!repeated && sent.has(step)) return;
    sent.add(step);
    void send({
      step,
      session,
      guest: storage.guestId(),
      number: number ?? storage.readOrder()?.n ?? null,
    }).catch(() => {});
  };
}
