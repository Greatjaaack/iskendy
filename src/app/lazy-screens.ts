// One lazy module for what is not on the first screen (rating, «⋯», sheets, served
// order card, footer below the fold): a single
// lazy chunk keeps shared code in the startup chunk instead of extra common chunks.
export { Rating } from '../screens/Rating/Rating';
export {
  OrderMenu,
  RemoveOrder,
  Notifications,
  AddOrder,
} from '../screens/Orders/OrderOverlays';
export { IssuedCard } from '../ui/IssuedCard/IssuedCard';
