import { useEffect, useId, useRef, useState } from 'react';
import { reviewContent as text } from '../../content/review';
import attach from '../../assets/review/attach.svg';
import photo from '../../assets/review/photo.svg';
import video from '../../assets/review/video.svg';
import { Icon } from '../Icon/Icon';
import styles from './Attachments.module.css';
export type AttachmentDraft = { id: string; file: File };
/** Local selection only. Upload and successful delivery require the backend contract in docs/48. */
export function Attachments({
  files,
  onChange,
  disabled = false,
}: {
  files: AttachmentDraft[];
  onChange: (files: AttachmentDraft[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    id = useId();
  const [error, setError] = useState('');
  const choose = (list: FileList | null) => {
    if (!list) return;
    const additions = Array.from(list).filter((file) => file.size > 0);
    if (additions.length !== list.length) setError(text.invalidFile);
    else setError('');
    onChange([
      ...files,
      ...additions.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  };
  return (
    <div className={styles.attachments + ' ym-hide-content'}>
      <input
        id={id}
        ref={input}
        type="file"
        multiple
        hidden
        disabled={disabled}
        onChange={(event) => {
          choose(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        hidden
        disabled={disabled}
        onChange={(event) => {
          choose(event.target.files);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className={styles.add}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <img src={attach} width="24" height="24" alt="" />
        <span>
          <strong>{text.attach}</strong>
          <span>{text.attachmentHint}</span>
        </span>
      </button>
      <button
        type="button"
        className={styles.camera}
        disabled={disabled}
        onClick={() => camera.current?.click()}
      >
        {text.camera}
      </button>
      {files.length > 0 && (
        <ul className={styles.list}>
          {files.map(({ id, file }) => (
            <li key={id} className={styles.file}>
              {file.type.startsWith('image/') ? (
                <FilePreview file={file} />
              ) : (
                <img
                  className={styles.fileIcon}
                  src={file.type.startsWith('video/') ? video : photo}
                  alt=""
                />
              )}
              <span className={styles.fileName}>
                <strong>{file.name}</strong>
                <span>
                  {new Intl.NumberFormat('ru-RU', {
                    maximumFractionDigits: 1,
                  }).format(file.size / 1024)}{' '}
                  КБ
                </span>
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={text.removeFile(file.name)}
                onClick={() => onChange(files.filter((item) => item.id !== id))}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function FilePreview({ file }: { file: File }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let active = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (active && typeof reader.result === 'string') setSource(reader.result);
    };
    reader.readAsDataURL(file);
    return () => {
      active = false;
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);
  return (
    <img
      src={source ?? photo}
      onError={() => setSource(photo)}
      className={styles.preview}
      alt=""
    />
  );
}
