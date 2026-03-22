import { Trash2, Plus, X } from 'lucide-react';

// Clothing + Footwear sizes (EU 38–43 with US mapping in label)
const SIZE_OPTIONS = [
  // Apparel (letter sizes)
  'XXS','XS','S','M','L','XL','XXL','XXXL','XXXXL','XXXXL',
  '22','24','26','28','30','32','34','36','38',

  // Numeric sizes (dress/footwear etc.)
  '36 ','37','38','39 (US 6.5)','40 (US 7)','41 (US 8)','42 (US 8.5)','43 (US 9.5)','44 (US 10)','45 (US 11)','46 (US 12)',
];


interface VariationData {
  id: string;
  color: string;
  images: File[];
  imagePreviews: string[];
  sizes: string[];
}

interface VariationCardProps {
  variation: VariationData;
  index: number;
  onUpdate: (color: string) => void;
  onRemove: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImageRemove: (imageIndex: number) => void;
  onSizeAdd: () => void;
  onSizeUpdate: (sizeIndex: number, value: string) => void;
  onSizeRemove: (sizeIndex: number) => void;

  // When true, shows color as required (enforced by parent when >1 variation)
  colorRequired?: boolean;

  // Optional: override size dropdown options (e.g., sneakers-only or dresses-only)
  sizeOptions?: string[];

  // Optional: preset buttons (e.g., add all sneaker sizes)
  sizePresetButtons?: Array<{ key: string; label: string }>;
  onApplySizePreset?: (key: string) => void;
}

export default function VariationCard({
  variation,
  index,
  onUpdate,
  onRemove,
  onImageUpload,
  onImageRemove,
  onSizeAdd,
  onSizeUpdate,
  onSizeRemove,
  colorRequired = false,
  sizeOptions,
  sizePresetButtons,
  onApplySizePreset
}: VariationCardProps) {
  const options = Array.isArray(sizeOptions) && sizeOptions.length > 0 ? sizeOptions : SIZE_OPTIONS;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-white">
            Variation {index + 1}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {variation.color || 'Unnamed'} • {variation.sizes.length} size(s) • {variation.images.length} image(s)
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Color Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Color Name{' '}
            {colorRequired ? (
              <span className="text-red-500">*</span>
            ) : (
              <span className="text-gray-500 font-normal">(Optional)</span>
            )}
          </label>
          <input
            type="text"
            value={variation.color}
            onChange={(e) => onUpdate(e.target.value)}
            placeholder="e.g., Blue, Red, Black"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Images <span className="text-gray-500 font-normal">(Optional)</span>
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Upload images for {variation.color || 'this variation'} (shared across all sizes)
          </p>
          
          <div className="grid grid-cols-4 gap-3">
            {variation.imagePreviews.map((preview, imgIdx) => (
              <div key={imgIdx} className="relative group">
                <img
                  src={preview}
                  alt={`${variation.color} ${imgIdx + 1}`}
                  className="w-full h-24 object-cover rounded-lg border border-gray-300 dark:border-gray-600"
                />
                {imgIdx === 0 && (
                  <div className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded">
                    Main
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onImageRemove(imgIdx)}
                  className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            <label className="cursor-pointer w-full h-24 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors bg-gray-50 dark:bg-gray-700/50">
              <Plus className="w-5 h-5 text-gray-400 mb-1" />
              <span className="text-xs text-gray-500">Add</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onImageUpload}
              />
            </label>
          </div>
        </div>

        {/* Sizes */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Sizes <span className="text-gray-500 font-normal">(Optional)</span>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {Array.isArray(sizePresetButtons) &&
                sizePresetButtons.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => onApplySizePreset?.(b.key)}
                    className="px-2.5 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {b.label}
                  </button>
                ))}

              <button
                type="button"
                onClick={onSizeAdd}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Size
              </button>
            </div>
          </div>

          {variation.sizes.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-center">
              No sizes added yet
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {variation.sizes.map((size, sizeIdx) => (
                <div
                  key={sizeIdx}
                  className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <select
                    value={size}
                    onChange={(e) => onSizeUpdate(sizeIdx, e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">Select</option>
                    {options.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onSizeRemove(sizeIdx)}
                    className="text-red-500 hover:text-red-600 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}