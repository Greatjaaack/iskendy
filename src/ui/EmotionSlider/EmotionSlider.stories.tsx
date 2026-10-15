import { useState } from 'react';
import { emotionNames, emotions, type Emotion } from '../../content/emotion';
import { EmotionSlider } from './EmotionSlider';
function Example({ initial }: { initial: Emotion }) {
  const [value, setValue] = useState(initial);
  return (
    <div data-testid={`emotion-slider-${initial}`}>
      <EmotionSlider
        value={value}
        onValueChange={setValue}
        label={emotionNames[initial - 1]!}
      />
    </div>
  );
}
export default function EmotionSliderStories() {
  return (
    <div>
      {emotions.map((value) => (
        <Example key={value} initial={value} />
      ))}
    </div>
  );
}
