import { emotionNames, emotions } from '../../content/emotion';
import { EmotionCharacter } from './EmotionCharacter';
export default function EmotionCharacterStories() {
  return (
    <div data-testid="emotion-characters">
      {emotions.map((emotion) => (
        <div key={emotion}>
          <EmotionCharacter emotion={emotion} alt={emotionNames[emotion - 1]} />
          <EmotionCharacter
            emotion={emotion}
            size="sm"
            alt={emotionNames[emotion - 1]}
          />
        </div>
      ))}
    </div>
  );
}
