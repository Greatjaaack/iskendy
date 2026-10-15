import { Button, buttonStates, buttonVariants } from './Button';
import styles from './Button.stories.module.css';
export default function ButtonStories() {
  return (
    <>
      <div data-testid="button-figma-grid" className={styles.grid}>
        {buttonVariants.flatMap((variant) =>
          buttonStates.map((state) => (
            <Button key={variant + state} variant={variant} state={state} />
          )),
        )}
      </div>
      <div data-testid="button-interaction">
        <Button
          label="Действие"
          onClick={(event) => {
            event.currentTarget.dataset.activated = 'true';
          }}
        />
      </div>
    </>
  );
}
