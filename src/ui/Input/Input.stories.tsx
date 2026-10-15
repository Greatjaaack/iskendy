import { useState } from 'react';
import { Input, inputStates } from './Input';
import { inputContent } from '../../content/input';
import styles from './Input.stories.module.css';
export default function InputStories() {
  const [order, setOrder] = useState('');
  const [comment, setComment] = useState('');
  return (
    <>
      <div data-testid="input-figma-grid" className={styles.grid}>
        {(['order-number', 'comment'] as const).flatMap((kind) =>
          inputStates.map((state) => (
            <Input
              key={kind + state}
              kind={kind}
              state={state}
              value={
                state === 'filled'
                  ? kind === 'comment'
                    ? inputContent.commentExample
                    : '112'
                  : state === 'error'
                    ? kind === 'comment'
                      ? inputContent.commentPlaceholder
                      : '999'
                    : ''
              }
              onValueChange={() => {}}
            />
          )),
        )}
      </div>
      <div data-testid="input-interaction">
        <Input value={order} onValueChange={setOrder} />
        <Input kind="comment" value={comment} onValueChange={setComment} />
      </div>
    </>
  );
}
