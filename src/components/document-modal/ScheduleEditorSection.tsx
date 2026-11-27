import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatDateInputMask, formatFlexibleDateInputMask } from '../../utils/dateUtils';

export interface ScheduleFormItem {
  kind: string;
  enabled: boolean;
  dateInput: string;
  repeatRule: string;
  yearInput: string;
}

interface ScheduleEditorSectionProps {
  scheduleItems: ScheduleFormItem[];
  onAddPeriodicSchedule: () => void;
  onRemovePeriodicSchedule: (kind: string) => void;
  onUpdateScheduleItem: (index: number, patch: Partial<ScheduleFormItem>) => void;
}

export const ScheduleEditorSection: React.FC<ScheduleEditorSectionProps> = ({
  scheduleItems,
  onAddPeriodicSchedule,
  onRemovePeriodicSchedule,
  onUpdateScheduleItem,
}) => {
  return (
    <div className="pt-2 border-t border-slate-200 space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-red-600 tracking-wider uppercase">
          THỜI HẠN BÁO CÁO
        </h4>
        <button
          type="button"
          onClick={onAddPeriodicSchedule}
          className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 flex items-center gap-1 hover:bg-blue-100"
        >
          <Plus className="w-3 h-3" />
          <span>Thêm định kỳ</span>
        </button>
      </div>

      <div className="space-y-2">
        {scheduleItems.map((item, idx) => (
          <div
            key={item.kind}
            className={`p-2.5 rounded-xl border transition ${
              item.enabled ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 min-w-[90px]">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(e) => onUpdateScheduleItem(idx, { enabled: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span>{item.kind}</span>
              </label>

              {item.enabled ? (
                <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
                  <input
                    type="text"
                    inputMode={item.kind === 'Sắp tới' ? 'numeric' : undefined}
                    maxLength={
                      item.kind === 'Sắp tới' || item.kind === 'Sơ kết' || item.kind === 'Tổng kết'
                        ? 10
                        : undefined
                    }
                    placeholder={
                      item.kind === 'Sắp tới'
                        ? 'dd/mm/yyyy'
                        : item.kind.startsWith('Định kỳ')
                        ? item.repeatRule === 'Hằng năm'
                          ? 'dd/mm'
                          : 'Ngày (1-31)'
                        : 'dd/mm/yyyy, dd/mm hoặc yyyy'
                    }
                    value={item.dateInput}
                    onChange={(e) =>
                      onUpdateScheduleItem(idx, {
                        dateInput:
                          item.kind === 'Sắp tới'
                            ? formatDateInputMask(e.target.value, item.dateInput)
                            : item.kind === 'Sơ kết' || item.kind === 'Tổng kết'
                            ? formatFlexibleDateInputMask(e.target.value, item.dateInput)
                            : e.target.value,
                      })
                    }
                    className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 font-medium text-xs min-w-[110px]"
                  />

                  {item.kind.startsWith('Định kỳ') ? (
                    <select
                      value={item.repeatRule}
                      onChange={(e) => onUpdateScheduleItem(idx, { repeatRule: e.target.value })}
                      className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 font-medium text-xs"
                    >
                      <option value="Hằng tháng">Hằng tháng</option>
                      <option value="Hằng quý">Hằng quý</option>
                      <option value="Hằng năm">Hằng năm</option>
                    </select>
                  ) : (
                    <select
                      value={item.repeatRule}
                      onChange={(e) => onUpdateScheduleItem(idx, { repeatRule: e.target.value })}
                      className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 font-medium text-xs"
                    >
                      <option value="Không lặp">Không lặp</option>
                      <option value="Hằng năm">Hằng năm</option>
                      <option value="Năm sau">Năm sau</option>
                    </select>
                  )}

                  {item.kind.startsWith('Định kỳ') && item.repeatRule === 'Hằng quý' && (
                    <span className="text-[10px] text-blue-700">
                      Ngày {item.dateInput || '…'} các tháng 12, 3, 6, 9
                    </span>
                  )}

                  {item.kind.startsWith('Định kỳ') && item.kind !== 'Định kỳ' && (
                    <button
                      type="button"
                      onClick={() => onRemovePeriodicSchedule(item.kind)}
                      className="p-1 rounded text-red-500 hover:bg-red-50"
                      title="Xóa kỳ này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-slate-400 italic">Chưa kích hoạt</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
