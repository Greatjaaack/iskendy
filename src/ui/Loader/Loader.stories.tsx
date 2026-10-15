import { Loader } from './Loader';
import { buttonContent } from '../../content/button';
export default function LoaderStories() {
  return (
    <div data-testid="loader-kit">
      <div data-testid="loader-figma-glyph">
        <Loader label={buttonContent.otherLoading} showLabel={false} />
      </div>
      <div data-testid="loader-with-copy">
        <Loader label={buttonContent.primaryLoading} />
      </div>
    </div>
  );
}
