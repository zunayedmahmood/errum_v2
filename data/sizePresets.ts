export const SIZE_PRESETS = {
  sneakers: ['36 ','37','38','39','40','41','42','43','44','45','46','47','48'],
  dresses: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
} as const;

export type SizePresetKey = keyof typeof SIZE_PRESETS;

export const getPresetLabel = (key: SizePresetKey): string => {
  switch (key) {
    case 'sneakers':
      return 'Add all sneaker sizes';
    case 'dresses':
      return 'Add all dress sizes';
    default:
      return 'Add all sizes';
  }
};
