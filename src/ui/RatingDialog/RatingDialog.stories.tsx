import { useState } from 'react';
import { Button } from '../Button/Button';
import { ratingContent as text } from '../../content/rating';
import {
  RatingDialog,
  type RatingDraft,
  type RatingStep,
} from './RatingDialog';
export default function RatingDialogStories() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<RatingStep>(1);
  const [draft, setDraft] = useState<RatingDraft>({
    emotion: 5,
    tags: [],
    comment: '',
  });
  return (
    <div data-testid="rating-dialog-kit">
      <RatingDialog
        open={open}
        onOpenChange={setOpen}
        number={112}
        step={step}
        draft={draft}
        branch="positive"
        trigger={<Button label={text.title(112)} />}
        onDraftChange={setDraft}
        onBack={() =>
          step === 1 ? setOpen(false) : setStep((step - 1) as RatingStep)
        }
        onNext={() => setStep(Math.min(4, step + 1) as RatingStep)}
        onSkip={() => setStep(3)}
      />
    </div>
  );
}
