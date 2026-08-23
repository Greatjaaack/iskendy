#!/bin/sh
# Поставить git-хуки из scripts/ в .git/hooks/.
#
# Отдельный шаг нужен потому, что .git/hooks не версионируется: на новой машине
# или после свежего clone хуков не будет, и об этом легко не вспомнить.
set -e
cd "$(dirname "$0")/.."
for hook in pre-push; do
  ln -sf "../../scripts/$hook" ".git/hooks/$hook"
  echo "поставлен: .git/hooks/$hook → scripts/$hook"
done
