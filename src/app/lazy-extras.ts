// Small pieces shown after the first paint (tiles, return bar, «Заказ готов», offline
// screens — preloaded while online): kept apart
// from lazy-screens so visiting «Мои заказы» never downloads the rating screen.
export { ReadyToast } from '../ui/ReadyToast/ReadyToast';
export { ReturnBar } from '../ui/ReturnBar/ReturnBar';
export { GameTile } from '../ui/GameTile/GameTile';
export { BoardTile } from '../ui/BoardTile/BoardTile';
export { OfflineOrders, OfflineBoard } from '../screens/Orders/Offline';
