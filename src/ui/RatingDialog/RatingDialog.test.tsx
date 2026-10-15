import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RatingDialog, type RatingStep } from './RatingDialog';
import { EmotionCharacter } from '../EmotionCharacter/EmotionCharacter';
const props = {
  open: true,
  onOpenChange: vi.fn(),
  number: 112,
  step: 1 as RatingStep,
  draft: { emotion: 5 as const, tags: [], comment: '' },
  branch: 'positive' as const,
  onDraftChange: vi.fn(),
  onBack: vi.fn(),
  onNext: vi.fn(),
  onSkip: vi.fn(),
};
describe('accessible rating dialog', () => {
  it.each([
    'javascript:alert(1)',
    'https:',
    'https://user:password@example.test/review',
  ])('does not render an unsafe review URL: %s', (mapsHref) => {
    render(<RatingDialog {...props} step={4} mapsHref={mapsHref} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('shows a server already acknowledgement without a guessed emotion or positive/negative thanks claim', () => {
    render(
      <RatingDialog
        {...props}
        step={4}
        alreadyMessage="Спасибо, отзыв по этому заказу уже принят"
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Спасибо');
    expect(
      screen.getByText('Спасибо, отзыв по этому заказу уже принят'),
    ).toBeVisible();
    expect(
      screen.queryByText(
        'Рады, что вам вкусно. Расскажите об этом на Яндекс Картах — нам важно.',
      ),
    ).not.toBeInTheDocument();
  });
  beforeEach(() =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    ),
  );
  afterEach(() => vi.unstubAllGlobals());
  it('names the dialog and closes with Escape without submitting', async () => {
    render(<RatingDialog {...props} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Оценка заказа 112',
    );
    expect(
      screen.getByRole('heading', { name: 'Как вам заказ?' }),
    ).toHaveFocus();
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Восторг',
    );
    await userEvent.keyboard('{Escape}');
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onNext).not.toHaveBeenCalled();
  });
  it('submits only on explicit action and disables duplicates while pending', async () => {
    const { rerender } = render(<RatingDialog {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(props.onNext).toHaveBeenCalledTimes(1);
    rerender(<RatingDialog {...props} pending />);
    expect(screen.getByRole('button', { name: 'Дальше' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Назад' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть' })).not.toBeDisabled();
  });
  it('takes branch from owner and emits reason selection without posting', () => {
    render(<RatingDialog {...props} branch="negative" step={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Остыло' }));
    expect(props.onDraftChange).toHaveBeenCalledWith({
      ...props.draft,
      tags: ['Остыло'],
    });
    expect(
      screen.queryByRole('button', { name: 'Вкус' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Пропустить' }));
    expect(props.onSkip).toHaveBeenCalledOnce();
  });
  it.each([
    [1, 'negative', 'Что вас разозлило?'], // Figma 556:14210
    [2, 'negative', 'Что пошло не так?'], // Figma 566:26672
    [3, 'negative', 'Что пошло не так?'], // Figma 566:26754
    [4, 'positive', 'Что порадовало?'], // Figma 566:26855
    [5, 'positive', 'Что порадовало?'], // Figma 556:14232
  ] as const)(
    'titles reasons for emotion %i by the drawn frame',
    (emotion, branch, title) => {
      render(
        <RatingDialog
          {...props}
          branch={branch}
          step={2}
          draft={{ ...props.draft, emotion }}
        />,
      );
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    },
  );
  it('preserves private comment semantics and API length bound', () => {
    render(
      <RatingDialog
        {...props}
        step={3}
        draft={{ ...props.draft, comment: 'private' }}
      />,
    );
    const comment = screen.getByRole('textbox', {
      name: 'Комментарий · необязательно',
    });
    expect(comment).toHaveValue('private');
    expect(comment).toHaveClass('ym-disable-keys');
    expect(comment.closest('.ym-hide-content')).not.toBeNull();
    expect(comment).toHaveAttribute('maxlength', '1000');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('uses the approved thanks without an external review action', () => {
    render(
      <RatingDialog
        {...props}
        step={4}
        mapsHref="https://example.test/yandex"
      />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('confirms a complaint reached the manager without promising a reply (Q-21)', () => {
    render(<RatingDialog {...props} step={4} branch="negative" />);
    expect(
      screen.getByText('Управляющий уже получил ваш отзыв.'),
    ).toBeVisible();
    expect(screen.queryByText(/Рады, что вам вкусно/)).not.toBeInTheDocument();
  });
  it.each([
    [1, 2],
    [2, 2],
    [5, 5],
  ] as const)(
    'thanks after emotion %i shows character %i (Кап after anger, Q-21)',
    (emotion, character) => {
      const expected = render(<EmotionCharacter emotion={character} />)
        .container.querySelector('img')!
        .getAttribute('src');
      const { baseElement } = render(
        <RatingDialog
          {...props}
          step={4}
          branch={emotion > 3 ? 'positive' : 'negative'}
          draft={{ ...props.draft, emotion }}
        />,
      );
      expect(
        baseElement.querySelector('[role="dialog"] img[data-size="lg"]'),
      ).toHaveAttribute('src', expected);
    },
  );
  it('renders completion only when owner explicitly passes step 4', () => {
    render(
      <RatingDialog
        {...props}
        step={4}
        mapsHref="javascript:alert(1)"
        error="test error"
      />,
    );
    expect(
      // Figma 556:14278: positive thanks uses the same title as negative 556:14267.
      screen.getByRole('heading', { name: 'Спасибо вам большое' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('test error');
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onNext).not.toHaveBeenCalled();
  });
});
describe('neutral selection from the first frame (approved 15 October)', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    ),
  );
  afterEach(() => vi.unstubAllGlobals());
  it('shows emotion 3 and accepts an explicit Next without first moving the slider', async () => {
    render(
      <RatingDialog {...props} draft={{ emotion: 3, tags: [], comment: '' }} />,
    );
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Нормально',
    );
    expect(screen.getByRole('button', { name: 'Дальше' })).toBeEnabled();
    expect(screen.queryByText('Выберите эмоцию')).not.toBeInTheDocument();
  });
});

// The reason editor is transactional: opening/cancelling never changes the draft.
it('focuses Other in a nested editor and commits only with OK', async () => {
  render(<RatingDialog {...props} step={2} branch="negative" />);
  await userEvent.click(screen.getByRole('button', { name: 'Другое' }));
  const field = screen.getByRole('textbox', {
    name: 'Что именно?',
  });
  expect(field).toHaveFocus();
  fireEvent.change(field, { target: { value: 'Соус' } });
  expect(props.onDraftChange).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'ОК' }));
  expect(props.onDraftChange).toHaveBeenCalledWith({
    ...props.draft,
    tags: ['Другое'],
    other: 'Соус',
  });
  expect(screen.queryByRole('textbox', { name: 'Что именно?' })).toBeNull();
});
