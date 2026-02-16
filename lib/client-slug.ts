export const buildClientPath = (id: number, name?: string | null) => {
  const slug = slugifyClientName(name || '');
  return `/clients/${id}${slug ? `-${slug}` : ''}`;
};

export const parseClientIdParam = (param: string) => {
  const match = param.match(/^\d+/);
  if (!match) return null;
  const id = Number.parseInt(match[0], 10);
  return Number.isNaN(id) ? null : id;
};

const MAX_SLUG_LENGTH = 60;

export const slugifyClientName = (name: string) => {
  if (!name) return '';

  const map: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'i',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'shch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };

  const normalized = name.trim().toLowerCase();
  let output = '';

  for (const char of normalized) {
    if (char >= 'a' && char <= 'z') {
      output += char;
      continue;
    }

    if (char >= '0' && char <= '9') {
      output += char;
      continue;
    }

    if (map[char] !== undefined) {
      output += map[char];
      continue;
    }

    if (char === '&') {
      output += '-and-';
      continue;
    }

    if (char === ' ' || char === '_' || char === '-' || char === '.' || char === ',' || char === '/' || char === '\\') {
      output += '-';
      continue;
    }
  }

  let slug = output.replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '').replace(/^-+/g, '');
  }
  return slug;
};
