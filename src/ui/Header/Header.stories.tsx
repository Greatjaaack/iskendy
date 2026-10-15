import { HeaderMobile, HeaderDesktop } from './Header';
export default function HeaderStories() {
  return (
    <>
      <div data-testid="header-mobile">
        <HeaderMobile mapsHref="https://example.test/yandex" />
      </div>
      <div data-testid="header-desktop">
        <HeaderDesktop active="order" number="112" />
      </div>
    </>
  );
}
