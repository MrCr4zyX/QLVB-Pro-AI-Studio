import calendar
import queue
import threading
from collections import defaultdict
from contextlib import closing, contextmanager
import re
import unicodedata
import json
import os
import shutil
import sqlite3
import sys
import uuid
from datetime import date, datetime
from pathlib import Path
import tkinter as tk
from tkinter import ttk, messagebox, filedialog

APP_NAME = 'K02 Document Manager 3.5.11'
# Tùy chỉnh giao diện nút và tab (pixel, riêng font_size là point)
BUTTON_HEIGHT = 32     #Chiều cao nút, tính bằng pixel
BUTTON_GAP = 8         #Khoảng cách ngang giữa các nút
BUTTON_ROW_GAP = 8     #Khoảng cách phía dưới thanh nút
BUTTON_FONT_SIZE = 12  #Cỡ chữ trên nút, tính bằng point
BUTTON_WIDTH_MIN = 80  #Chiều rộng tối thiểu của nút, tính bằng pixel

TAB_FONT_SIZE = 12      #Cỡ chữ tiêu đề tab
TAB_PADDING_X = 2       #Khoảng đệm trái và phải của tab
TAB_PADDING_Y = 2       #Khoảng đệm trên và dưới của tab

# Cỡ chữ bảng Quản lý văn bản (point) - chỉnh tại đây
DOC_TABLE_FONT_SIZE = 11    #Cỡ chữ các cột thông thường
DOC_SUMMARY_FONT_SIZE = 11  #Cỡ chữ riêng cột Trích yếu
DOC_NOTES_FONT_SIZE = 10    # Cỡ chữ riêng cột Chú thích
DOC_SUMMARY_MIN_WIDTH = 180  # Chiều rộng tối thiểu cột Trích yếu (pixel)
DOC_NOTES_WIDTH = 125       # Chiều rộng ưu tiên cột Chú thích (pixel)
DOC_TABLE_ROW_PADDING = 7  #Khoảng đệm chiều cao mỗi dòng

ALERT_FONT_SIZE = 10       #Cỡ chữ cửa sổ cảnh báo
ALERT_AUTO_TIMES = ('09:00', '14:00')  # Giờ tự hiển thị cảnh báo mỗi ngày

# Dashboard - TỔNG QUAN
DASHBOARD_TITLE_FONT_SIZE = 15          #Cỡ chữ tiêu đề TỔNG QUAN CÔNG VIỆC (pt).
DASHBOARD_CARD_NUMBER_FONT_SIZE = 23    #Cỡ chữ số thống kê trong các ô, ví dụ 2, 11, 1 (pt).
DASHBOARD_CARD_LABEL_FONT_SIZE = 11     #Cỡ chữ nhãn các ô thống kê như TỔNG VĂN BẢN, CHƯA HOÀN THÀNH, QUÁ HẠN (pt).
DASHBOARD_TABLE_ROW_HEIGHT = 25         #Chiều cao mỗi dòng dữ liệu trong bảng CÔNG VIỆC CẦN ƯU TIÊN (pixel).
DASHBOARD_UPCOMING_DAYS = 7             #Số ngày dùng để xác định công việc sắp đến hạn cần ưu tiên.

# Bảng Theo Dõi Báo Cáo - tùy chỉnh độc lập
REPORT_TABLE_FONT_SIZE = 10      # Cỡ chữ dữ liệu
REPORT_HEADER_FONT_SIZE = 10     # Cỡ chữ tiêu đề cột
REPORT_TABLE_ROW_HEIGHT = 25    # Chiều cao dòng

# Quan ly ket qua bao cao
RESULT_EDITOR_WIDTH = 650
RESULT_EDITOR_HEIGHT = 535
RESULT_NOTES_LINES = 4


# Số dòng hiển thị trong cửa sổ Thêm / Chỉnh sửa văn bản
EDITOR_SUMMARY_LINES = 4       # Trích yếu nội dung
EDITOR_NOTES_LINES = 2         # Chú thích trọng tâm
EDITOR_ATTACHMENT_LINES = 2    # Đường dẫn file đính kèm (tự xuống dòng)


PASTEL = {
    'red': ("#FA9E9E", '#EDAAAA'),
    'yellow': ("#FFE597", '#F6D781'),
    'green': ("#A2F0B5", '#A9DEB8'),
    'blue': ("#98C6F1", '#A9D0F5'),
    'purple': ('#C8A2E8', '#D8B9F2')
}
SECURITY_LEVELS = ('Thường', 'Mật', 'Tối mật', 'Tuyệt mật')
ROOT = Path(sys.executable if getattr(sys, 'frozen', False) else __file__).resolve().parent

# Hình ảnh đóng gói với PyInstaller được giải nén vào sys._MEIPASS.
def resource_path(filename):
    bundled = Path(getattr(sys, '_MEIPASS', ROOT)) / filename
    return bundled if bundled.is_file() else ROOT / filename

LOGO_SIZE = 115  # Kích thước tối đa của logo nhận diện (pixel)
BRAND_TOP = 2  # Vị trí tính từ mép trên cửa sổ (pixel)
BRAND_RIGHT = 20  # Khoảng cách đến mép phải (pixel)
DATA = ROOT / 'DATA'
BACKUP = ROOT / 'BACKUP'
SAFETY_BACKUP = BACKUP / 'SAFETY'
EXIT_BACKUP = BACKUP / 'THOAT_APP'  # Riêng các bản sao khi thoát ứng dụng
AUDIT_PATH = BACKUP / 'operations.jsonl'
CONFIG = ROOT / 'CONFIG'
ATTACH = ROOT / 'ATTACHMENTS'
for folder in (DATA, BACKUP, CONFIG, ATTACH):
    folder.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA / 'documents.db'
EXCEL_PATH = DATA / 'documents.xlsx'
SETTINGS_PATH = CONFIG / 'settings.json'
KINDS = ['Sắp tới', 'Định kỳ 1', 'Định kỳ 2', 'Sơ kết', 'Tổng kết']
REPEATS = ['Không lặp', 'Hằng năm']
DEFAULT_TYPES = ('Luật', 'Pháp lệnh', 'Nghị quyết', 'Nghị định', 'Quyết định',
                 'Thông tư', 'Thông tư liên tịch', 'Chỉ thị', 'Công văn',
                 'Kế hoạch', 'Hướng dẫn', 'Khác')
DEFAULT_FIELDS = ('Thi đua - Khen thưởng', 'Tổ chức cán bộ', 'Chính trị tư tưởng',
                  'Tham mưu - Tổng hợp', 'Huấn luyện', 'Hậu cần - Kỹ thuật', 'Khác')
VALID_STATUSES = ('Còn hiệu lực', 'Hết hiệu lực', 'Cần rà soát')



def search_key(value):
    """Chuẩn hóa tìm kiếm tiếng Việt: bỏ dấu, không phân biệt hoa/thường."""
    text = unicodedata.normalize('NFD', str(value or '').casefold())
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    return text.replace('đ', 'd')


def parse_date(s, optional=False):
    s = (s or '').strip()
    if not s and optional:
        return None
    return datetime.strptime(s, '%d/%m/%Y').date()


def display_date(s):
    return date.fromisoformat(s).strftime('%d/%m/%Y') if s else ''


def parse_flexible_date(value, annual=False, base_year=None):
    """Return ISO period and precision; unknown day/month are NOT deadlines."""
    value = value.strip()
    if not value:
        raise ValueError('Chưa nhập thời gian báo cáo')
    if annual and len(value.split('/')) == 2:
        parts = value.split('/')
        if all(part.isdigit() for part in parts) and len(parts[1]) <= 2:
            day, month = map(int, parts)
            year = base_year or date.today().year
            try:
                d = date(2000, month, day)  #năm nhuận để nhận 29/02
            except ValueError:
                raise ValueError('Ngày lặp hằng năm phải là dd/mm hợp lệ')
            return date(year, month, min(day, calendar.monthrange(year, month)[1])).isoformat(), 'day'
    for fmt, precision in (('%d/%m/%Y','day'), ('%m/%Y','month'), ('%Y','year')):
        try:
            d = datetime.strptime(value, fmt).date()
            if precision == 'day': return d.isoformat(), precision
            if precision == 'month': return f'{d.year:04d}-{d.month:02d}', precision
            return f'{d.year:04d}', precision
        except ValueError:
            continue
    raise ValueError('Thời gian phải là dd/mm/yyyy, mm/yyyy hoặc yyyy; nếu lặp hằng năm có thể nhập dd/mm')


def period_label(iso):
    if not iso: return ''
    if len(iso) == 4: return iso
    if len(iso) == 7: return iso[5:7] + '/' + iso[:4]
    return display_date(iso)


def period_projection(iso):
    """Sort approximate dates by END of month/year, not as a binding deadline."""
    if len(iso) == 4: return f'{iso}-12-31'
    if len(iso) == 7:
        year, month = map(int, iso.split('-'))
        return f'{iso}-{calendar.monthrange(year, month)[1]:02d}'
    return iso


def db_connect():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA busy_timeout=5000')
    return c


@contextmanager
def db_session():
    """Đóng kết nối SQLite sau khi commit hoặc rollback giao dịch."""
    with closing(db_connect()) as connection:
        with connection:
            yield connection


def init_db():
    # Sao luu an toan truoc lan dau mo rong bang report_history.
    if DB_PATH.exists():
        with db_session() as check:
            existing = {r[1] for r in check.execute('PRAGMA table_info(report_history)')}
        if existing and 'result_symbol' not in existing:
            BACKUP.mkdir(parents=True, exist_ok=True)
            dest = BACKUP / f'documents_pre_2_6_{datetime.now():%Y%m%d_%H%M%S}.db'
            with closing(sqlite3.connect(dest)) as backup_conn, db_session() as source_conn:
                source_conn.backup(backup_conn)
    with db_session() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS documents(
          id TEXT PRIMARY KEY, issued TEXT NOT NULL, number TEXT NOT NULL,
          symbol TEXT NOT NULL, agency TEXT NOT NULL, summary TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '', attachment TEXT NOT NULL DEFAULT '',
          updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS schedules(
          id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          kind TEXT NOT NULL, start_date TEXT, day_of_month INTEGER,
          repeat_rule TEXT NOT NULL DEFAULT 'Không lặp',
          precision TEXT NOT NULL DEFAULT 'day',
          UNIQUE(document_id,kind));
        CREATE TABLE IF NOT EXISTS report_history(
          id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
          due_date TEXT NOT NULL, completed_date TEXT, notes TEXT NOT NULL DEFAULT '',
          UNIQUE(schedule_id,due_date));
        ''')
        document_cols = {r[1] for r in c.execute('PRAGMA table_info(documents)')}
        if 'security_level' not in document_cols:
            c.execute("ALTER TABLE documents ADD COLUMN security_level TEXT NOT NULL DEFAULT 'Thường'")
        cols = {r[1] for r in c.execute('PRAGMA table_info(schedules)')}
        if 'precision' not in cols:
            c.execute("ALTER TABLE schedules ADD COLUMN precision TEXT NOT NULL DEFAULT 'day'")
        history_cols = {r[1] for r in c.execute('PRAGMA table_info(report_history)')}
        for name in ('result_symbol', 'result_attachment', 'result_notes', 'result_updated'):
            if name not in history_cols:
                c.execute(f"ALTER TABLE report_history ADD COLUMN {name} TEXT NOT NULL DEFAULT ''")
        c.execute("""CREATE TABLE IF NOT EXISTS result_audit (
            id TEXT PRIMARY KEY, report_id TEXT NOT NULL,
            action TEXT NOT NULL, changed_at TEXT NOT NULL,
            completed_date TEXT, result_symbol TEXT, result_attachment TEXT,
            result_notes TEXT
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS document_change_log (
            id TEXT PRIMARY KEY, document_id TEXT NOT NULL,
            changed_at TEXT NOT NULL, action TEXT NOT NULL,
            document_label TEXT NOT NULL, details TEXT NOT NULL
        )""")
        # 3.5: migration không xóa/đổi khóa của dữ liệu 3.4.2.
        existing = {r[1] for r in c.execute('PRAGMA table_info(documents)')}
        for name, definition in (
            ('type_id', 'INTEGER'), ('effect_status', "TEXT NOT NULL DEFAULT 'Cần rà soát'"),
            ('expiry_date', 'TEXT'), ('amendment_text', "TEXT NOT NULL DEFAULT ''")):
            if name not in existing:
                c.execute(f'ALTER TABLE documents ADD COLUMN {name} {definition}')
        c.execute('CREATE TABLE IF NOT EXISTS document_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1)')
        c.execute('CREATE TABLE IF NOT EXISTS work_fields (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1)')
        c.execute('CREATE TABLE IF NOT EXISTS document_fields (document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, field_id INTEGER NOT NULL REFERENCES work_fields(id), PRIMARY KEY(document_id,field_id))')
        c.execute('CREATE TABLE IF NOT EXISTS document_amendments (document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, amendment_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, PRIMARY KEY(document_id,amendment_id), CHECK(document_id != amendment_id))')
        for name in DEFAULT_TYPES:
            c.execute('INSERT OR IGNORE INTO document_types(name) VALUES(?)', (name,))
        for name in DEFAULT_FIELDS:
            c.execute('INSERT OR IGNORE INTO work_fields(name) VALUES(?)', (name,))
        c.execute('CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type_id)')
        c.execute('CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents(expiry_date)')
        c.execute('CREATE INDEX IF NOT EXISTS idx_doc_change_time ON document_change_log(changed_at)')
        c.execute('CREATE INDEX IF NOT EXISTS idx_result_audit_report ON result_audit(report_id, changed_at)')
        c.execute('CREATE INDEX IF NOT EXISTS idx_schedules_document ON schedules(document_id)')
        c.execute('CREATE INDEX IF NOT EXISTS idx_history_schedule_due ON report_history(schedule_id, due_date)')



DOCUMENT_FIELDS = {
    'issued': 'Ngày ban hành', 'number': 'Số văn bản', 'symbol': 'Ký hiệu',
    'agency': 'Cơ quan ký', 'summary': 'Trích yếu', 'notes': 'Chú thích',
    'attachment': 'Đường dẫn đính kèm', 'security_level': 'Độ mật',
    'type_id': 'Loại văn bản (ID)', 'effect_status': 'Trạng thái hiệu lực',
    'expiry_date': 'Ngày hết hiệu lực', 'amendment_text': 'Văn bản sửa đổi (nhập tay)'
}


def document_snapshot(c, document_id):
    row = c.execute('SELECT * FROM documents WHERE id=?', (document_id,)).fetchone()
    if row is None:
        return None
    schedules = c.execute('SELECT kind,start_date,day_of_month,repeat_rule,precision '
                          'FROM schedules WHERE document_id=? ORDER BY kind', (document_id,)).fetchall()
    fields = [r[0] for r in c.execute('SELECT field_id FROM document_fields WHERE document_id=? ORDER BY field_id', (document_id,))]
    amendments = [r[0] for r in c.execute('SELECT amendment_id FROM document_amendments WHERE document_id=? ORDER BY amendment_id', (document_id,))]
    return {'document': {key: row[key] for key in DOCUMENT_FIELDS},
            'fields': fields, 'amendments': amendments,
            'schedules': {r['kind']: dict(r) for r in schedules}}


def write_document_change(c, document_id, action, before, after):
    """Ghi cùng transaction với thao tác dữ liệu; chỉ ghi các trường có thay đổi."""
    lines = []
    old_doc = before['document'] if before else {}
    new_doc = after['document'] if after else {}
    for key, title in DOCUMENT_FIELDS.items():
        old, new = old_doc.get(key, ''), new_doc.get(key, '')
        if old != new:
            lines.append(f'{title}: {old or "(trống)"}  ->  {new or "(trống)"}')
    for key, label in (('fields', 'Lĩnh vực (ID)'), ('amendments', 'Văn bản sửa đổi liên kết')):
        old = before.get(key, []) if before else []
        new = after.get(key, []) if after else []
        if old != new:
            lines.append(f'{label}: {old} -> {new}')
    old_schedules = before['schedules'] if before else {}
    new_schedules = after['schedules'] if after else {}
    for kind in sorted(set(old_schedules) | set(new_schedules)):
        old, new = old_schedules.get(kind), new_schedules.get(kind)
        if old != new:
            def fmt(v):
                if not v: return '(không có)'
                return f"{v['start_date'] or ''}; ngày {v['day_of_month'] or '-'}; {v['repeat_rule']}; {v['precision']}"
            lines.append(f'Lịch {kind}: {fmt(old)}  ->  {fmt(new)}')
    if not lines:
        return
    doc = new_doc or old_doc
    label = f"{doc.get('number', '')}/{doc.get('symbol', '')}"
    c.execute('INSERT INTO document_change_log VALUES (?,?,?,?,?,?)',
              (str(uuid.uuid4()), document_id, datetime.now().isoformat(timespec='seconds'),
               action, label, '\n'.join(lines)))


def export_change_history_txt():
    """Tạo file TXT UTF-8 từ nhật ký trong DB mỗi lần người dùng yêu cầu."""
    destination = BACKUP / 'LICH_SU_THAY_DOI.txt'
    with db_session() as c:
        edits = c.execute('SELECT changed_at,action,document_label,details '
                          'FROM document_change_log ORDER BY changed_at, rowid').fetchall()
        reports = c.execute("""SELECT a.changed_at,a.action,a.completed_date,a.result_symbol,
                            d.number,d.symbol FROM result_audit a
                            LEFT JOIN report_history h ON h.id=a.report_id
                            LEFT JOIN schedules s ON s.id=h.schedule_id
                            LEFT JOIN documents d ON d.id=s.document_id
                            ORDER BY a.changed_at, a.rowid""").fetchall()
    entries = []
    for r in edits:
        entries.append((r['changed_at'], f"[{r['changed_at']}] {r['action']} - Văn bản {r['document_label']}\n{r['details']}"))
    for r in reports:
        label = f"{r['number'] or '?'} / {r['symbol'] or '?'}"
        entries.append((r['changed_at'], f"[{r['changed_at']}] {r['action']} - Kết quả báo cáo {label}\n"
                        f"Ngày hoàn thành: {r['completed_date'] or 'Chưa hoàn thành'}; "
                        f"Số/ký hiệu kết quả: {r['result_symbol'] or '(trống)'}"))
    entries.sort(key=lambda item: item[0])
    header = ('NHẬT KÝ THAY ĐỔI - K02 DOCUMENT MANAGER\n'
              'Dữ liệu chỉ ghi nhận từ khi bật tính năng nhật ký; '
              'các chỉnh sửa trước đó không thể truy ngược.\n'
              'LƯU Ý: Có thể chứa nội dung văn bản nhạy cảm, không chia sẻ tùy tiện.\n'
              + '=' * 72 + '\n\n')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix('.txt.tmp')
    try:
        temp.write_text(header + ('\n\n' + '-' * 72 + '\n\n').join(x[1] for x in entries)
                        + ('\n' if entries else '(Chưa có sự kiện thay đổi)\n'), encoding='utf-8-sig')
        os.replace(temp, destination)
    finally:
        temp.unlink(missing_ok=True)
    return destination

def add_months(d, months):
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def due_dates(schedule, today=None):
    today = today or date.today()
    kind = schedule['kind']
    precision = schedule['precision'] if 'precision' in schedule.keys() else 'day'
    if kind.startswith('Định kỳ'):
        day = schedule['day_of_month']
        start = date.fromisoformat(schedule['start_date']) if schedule['start_date'] else today
        result = []
        if schedule['repeat_rule'] == 'Hằng năm':
            for year in range(start.year, max(start.year, today.year) + 3):
                d = date(year, start.month, min(day, calendar.monthrange(year, start.month)[1]))
                if d >= start: result.append(d)
        else:
            begin = max(start.year * 12 + start.month - 1, today.year * 12 + today.month - 1 - 2)
            for index in range(begin, today.year * 12 + today.month - 1 + 13):
                year, month0 = divmod(index, 12)
                month = month0 + 1
                d = date(year, month, min(day, calendar.monthrange(year, month)[1]))
                if d >= start: result.append(d)
        return result
    if not schedule['start_date']:
        return []
    base_iso = schedule['start_date']
    base = date.fromisoformat(period_projection(base_iso))
    rule = schedule['repeat_rule']
    if rule == 'Không lặp': return [base]
    if rule == 'Năm sau':
        y = base.year + 1
        return [base, date(y, base.month, min(base.day, calendar.monthrange(y,base.month)[1]))]
    if rule.startswith('Năm:'):
        y = int(rule.split(':', 1)[1])
        return [base, date(y,base.month,min(base.day,calendar.monthrange(y,base.month)[1]))] if y != base.year else [base]
    return [date(y,base.month,min(base.day,calendar.monthrange(y,base.month)[1]))
            for y in range(base.year,max(base.year,today.year)+3)]


def ensure_periods(c):
    for s in c.execute('SELECT * FROM schedules').fetchall():
        for d in due_dates(s):
            c.execute('INSERT OR IGNORE INTO report_history(id,schedule_id,due_date) VALUES(?,?,?)',
                      (str(uuid.uuid4()), s['id'], d.isoformat()))


def all_reports():
    with db_session() as c:
        ensure_periods(c)
        c.commit()
        return c.execute('''SELECT h.id, h.due_date, h.completed_date, h.notes,
          h.result_symbol, h.result_attachment, h.result_notes, h.result_updated,
          s.kind, s.precision, s.start_date AS schedule_start, d.id AS document_id, d.number, d.symbol, d.summary
          FROM report_history h JOIN schedules s ON s.id=h.schedule_id
          JOIN documents d ON d.id=s.document_id
          ORDER BY h.due_date, d.number''').fetchall()


def report_display(r):
    precision=r['precision']
    if precision=='day':return display_date(r['due_date']), remaining_text(r['due_date'],r['completed_date'])
    due=date.fromisoformat(r['due_date'])
    if precision=='year':
        label=f'{due.year:04d}'
    else:
        label=f'{due.month:02d}/{due.year:04d}'
    if r['completed_date']:return label,('Hoàn thành','done')
    return label,('Dự kiến...','yellow')


def remaining_text(iso, completed):
    if completed:
        return 'Hoàn thành', 'done'
    n = (date.fromisoformat(iso) - date.today()).days
    if n < 0:
        return f'Quá hạn {-n} ngày', 'overdue'
    if n == 0:
        return 'Đến hạn hôm nay', 'urgent'
    if n <= 7:
        return f'Còn {n} ngày', 'urgent'
    if n <= 15:
        return f'Còn {n} ngày', 'orange'
    if n <= 30:
        return f'Còn {n} ngày', 'yellow'
    target = date.fromisoformat(iso)
    current = date.today()
    months = (target.year - current.year) * 12 + target.month - current.month
    if months and add_months(current, months) > target:
        months -= 1
    days = (target - add_months(current, months)).days
    return f'Còn {months} tháng {days} ngày', 'normal'


MAX_BACKUPS = 5


def log_operation(action, **details):
    """Nhật ký kỹ thuật; không ghi nội dung văn bản hoặc thông tin độ mật."""
    try:
        BACKUP.mkdir(parents=True, exist_ok=True)
        entry = {'time': datetime.now().isoformat(timespec='seconds'), 'action': action,
                 'details': {k: str(v) for k, v in details.items()}}
        with AUDIT_PATH.open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(entry, ensure_ascii=False) + '\n')
    except OSError:
        pass  # Không cản thao tác nghiệp vụ vì nhật ký phụ không ghi được.


def _check_db(path):
    """Kiểm tra bản SQLite, đóng kết nối trước khi thao tác với file."""
    uri = f'file:{Path(path).resolve().as_posix()}?mode=ro'
    with closing(sqlite3.connect(uri, uri=True)) as check:
        result = check.execute('PRAGMA integrity_check').fetchone()
        if not result or result[0] != 'ok':
            raise ValueError('Cơ sở dữ liệu không đạt kiểm tra toàn vẹn.')
        tables = {r[0] for r in check.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {'documents', 'schedules', 'report_history'}.issubset(tables):
            raise ValueError('Cơ sở dữ liệu thiếu bảng bắt buộc.')


def backup_db(safety=False, on_exit=False, before_delete=False):
    """Sao lưu SQLite: thủ công / khi thoát / bảo vệ có thư mục riêng."""
    if sum(bool(x) for x in (safety, on_exit, before_delete)) > 1:
        raise ValueError('Chỉ chọn một loại sao lưu mỗi lần.')
    folder = SAFETY_BACKUP if (safety or before_delete) else EXIT_BACKUP if on_exit else BACKUP
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    prefix = ('Thoat_App' if on_exit else 'Truoc_Xoa_Van_Ban' if before_delete
              else 'Safety' if safety else 'documents')
    dest = folder / f'{prefix}_{stamp}.db'
    try:
        with closing(db_connect()) as src, closing(sqlite3.connect(dest)) as dst:
            src.backup(dst)
        _check_db(dest)
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    if not safety:
        # Mỗi nhóm (thủ công, thoát app, trước xóa) giữ tối đa 5 bản riêng biệt.
        copies = sorted(folder.glob(f'{prefix}_*.db'),
                        key=lambda f: f.stat().st_mtime, reverse=True)
        for old in copies[MAX_BACKUPS:]:
            try:
                old.unlink()
            except OSError as exc:
                log_operation('backup_prune_failed', file=old.name, error=exc)
    log_operation('backup_before_delete' if before_delete else 'backup_safety' if safety
                  else 'backup_exit' if on_exit else 'backup_manual', file=str(dest))
    return dest


def restore_db(source):
    """Khôi phục từ SQLite cũ/mới, tự nâng cấp schema, rollback nếu lỗi."""
    import tempfile
    source = Path(source).resolve()
    if not source.is_file() or source == DB_PATH.resolve():
        raise ValueError('Vui lòng chọn bản sao lưu khác dữ liệu hiện tại.')
    _check_db(source)
    with tempfile.TemporaryDirectory(prefix='k02_restore_') as temp_dir:
        staged = Path(temp_dir) / 'restore_source.db'
        with closing(sqlite3.connect(f'file:{source.as_posix()}?mode=ro', uri=True)) as src, \
             closing(sqlite3.connect(staged)) as dst:
            src.backup(dst)
        _check_db(staged)
        safety = backup_db(safety=True)
        try:
            with closing(sqlite3.connect(staged)) as src, closing(sqlite3.connect(DB_PATH)) as dst:
                src.backup(dst)
            # Bản sao cũ có thể chưa có bảng result_audit và các cột mới.
            # init_db() nâng cấp schema TRƯỚC KHI giao diện/export sử dụng.
            init_db()
            _check_db(DB_PATH)
        except Exception as exc:
            try:
                with closing(sqlite3.connect(safety)) as src, closing(sqlite3.connect(DB_PATH)) as dst:
                    src.backup(dst)
                init_db()
                _check_db(DB_PATH)
            except Exception as rollback_exc:
                raise RuntimeError(f'Khôi phục lỗi: {exc}. KHÔNG thể tự quay lui: {rollback_exc}. '
                                   f'Bản an toàn: {safety}') from exc
            raise RuntimeError(f'Khôi phục thất bại, dữ liệu cũ đã được phục hồi. Chi tiết: {exc}') from exc
    log_operation('restore', source=source.name, safety=safety.name)
    return safety


def broken_attachment_links():
    """Rà soát tất cả đường dẫn trong văn bản và kết quả báo cáo."""
    issues = []
    with db_session() as c:
        rows = c.execute("SELECT number, symbol, attachment FROM documents WHERE TRIM(attachment) != ''").fetchall()
        results = c.execute("SELECT d.number, d.symbol, h.result_attachment "
            "FROM report_history h JOIN schedules s ON h.schedule_id=s.id "
            "JOIN documents d ON s.document_id=d.id "
            "WHERE TRIM(h.result_attachment) != ''").fetchall()
    for kind, entries in (('Văn bản', rows), ('Kết quả báo cáo', results)):
        for row in entries:
            raw = row[2].strip().strip('"')
            target = Path(os.path.expandvars(os.path.expanduser(raw)))
            if not target.is_absolute():
                target = ROOT / target
            if not target.is_file():
                issues.append((kind, f'{row[0]}/{row[1]}', raw))
    return issues, len(rows) + len(results)


def export_excel(path=EXCEL_PATH):
    from openpyxl import Workbook
    wb = Workbook()
    with db_session() as c:
        for sheet, query in [
            ('VAN_BAN', 'SELECT * FROM documents'),
            ('LICH_BAO_CAO', 'SELECT * FROM schedules'),
            ('LICH_SU', 'SELECT * FROM report_history'),
            ('NHAT_KY_KET_QUA', 'SELECT * FROM result_audit'),
            ('LICH_SU_THAY_DOI', 'SELECT * FROM document_change_log'),
             ('LOAI_VAN_BAN', 'SELECT * FROM document_types'),
             ('LINH_VUC', 'SELECT * FROM work_fields'),
             ('VAN_BAN_LINH_VUC', 'SELECT * FROM document_fields'),
             ('VAN_BAN_SUA_DOI', 'SELECT * FROM document_amendments')]:
            ws = wb.active if sheet == 'VAN_BAN' else wb.create_sheet(sheet)
            ws.title = sheet
            rows = c.execute(query).fetchall()
            cols = [x[1] for x in c.execute('PRAGMA table_info(' + {'VAN_BAN':'documents','LICH_BAO_CAO':'schedules','LICH_SU':'report_history','NHAT_KY_KET_QUA':'result_audit','LICH_SU_THAY_DOI':'document_change_log','LOAI_VAN_BAN':'document_types','LINH_VUC':'work_fields','VAN_BAN_LINH_VUC':'document_fields','VAN_BAN_SUA_DOI':'document_amendments'}[sheet] + ')')]
            ws.append(cols)
            for row in rows:
                ws.append([row[col] for col in cols])
            ws.freeze_panes = 'A2'
            ws.auto_filter.ref = ws.dimensions
    temp = Path(str(path) + '.tmp.xlsx')
    wb.save(temp)
    os.replace(temp, path)


def import_excel(path):
    """Nhập Excel trong một transaction; lỗi bất kỳ sẽ rollback toàn bộ."""
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True, data_only=True)
    tables = [('VAN_BAN', 'documents'), ('LICH_BAO_CAO', 'schedules'),
              ('LICH_SU', 'report_history')]
    payload = []
    try:
        if any(sheet not in wb.sheetnames for sheet, _ in tables):
            raise ValueError('Excel phải có đủ 3 sheet: VAN_BAN, LICH_BAO_CAO, LICH_SU')
        with db_session() as c:
            for sheet, table in tables:
                rows = wb[sheet].iter_rows(values_only=True)
                headers = [str(x) if x is not None else '' for x in (next(rows, []) or [])]
                expected = [x[1] for x in c.execute(f'PRAGMA table_info({table})')]
                optional = {'precision', 'security_level', 'result_symbol',
                            'result_attachment', 'result_notes', 'result_updated',
                             'type_id', 'effect_status', 'expiry_date', 'amendment_text'}
                missing = (set(expected) - optional) - set(headers)
                if missing:
                    raise ValueError(f'Sheet {sheet} thiếu cột: {sorted(missing)}')
                indices = [headers.index(col) if col in headers else None for col in expected]
                id_index = headers.index('id')
                values = []
                for row in rows:
                    if not row or id_index >= len(row) or not row[id_index]:
                        continue
                    values.append(tuple(
                        str(row[i]) if i is not None and i < len(row) and row[i] is not None
                        else ('Thường' if col == 'security_level' else
                               'day' if col == 'precision' else
                               'Cần rà soát' if col == 'effect_status' else None if col in ('type_id','expiry_date') else '')
                        for col, i in zip(expected, indices)))
                payload.append((table, expected, values))
            # Danh mục phải nhập trước documents do ràng buộc tham chiếu logic.
            for sheet, table in [('LOAI_VAN_BAN','document_types'),('LINH_VUC','work_fields'),
                                 ('VAN_BAN_LINH_VUC','document_fields'),('VAN_BAN_SUA_DOI','document_amendments'),
                                 ('LICH_SU_THAY_DOI','document_change_log')]:
                if sheet not in wb.sheetnames: continue
                rows = wb[sheet].iter_rows(values_only=True)
                headers = list(next(rows,[]) or [])
                cols = [r[1] for r in c.execute(f'PRAGMA table_info({table})')]
                if not set(cols).issubset(headers): continue
                indices=[headers.index(k) for k in cols]
                values=[tuple(row[i] if i<len(row) else None for i in indices)
                        for row in rows if row and any(v is not None for v in row)]
                payload.append((table,cols,values))
            if 'NHAT_KY_KET_QUA' in wb.sheetnames:
                rows = wb['NHAT_KY_KET_QUA'].iter_rows(values_only=True)
                headers = list(next(rows, []) or [])
                fields = ('id', 'report_id', 'action', 'changed_at', 'completed_date',
                          'result_symbol', 'result_attachment', 'result_notes')
                if set(fields).issubset(headers):
                    indices = [headers.index(f) for f in fields]
                    audit = [tuple(row[i] if i < len(row) else None for i in indices)
                             for row in rows if row and row[headers.index('id')]]
                    payload.append(('result_audit', list(fields), audit))
    finally:
        wb.close()
    backup_db(safety=True)
    counts = []
    with db_session() as c:
        # Một kết nối, một giao dịch: không lưu một phần khi xảy ra lỗi.
        priority={'document_types':0,'work_fields':0,'documents':1,'schedules':2,'report_history':3,
                  'document_fields':4,'document_amendments':4,'result_audit':5,'document_change_log':5}
        for table, cols, rows in sorted(payload,key=lambda item:priority.get(item[0],6)):
            placeholders = ','.join('?' for _ in cols)
            before = c.total_changes
            c.executemany(f'INSERT OR IGNORE INTO {table} ({",".join(cols)}) VALUES ({placeholders})', rows)
            if table != 'result_audit':
                counts.append(c.total_changes - before)
    log_operation('import_excel', filename=Path(path).name, inserted=sum(counts))
    return counts


def startup_enabled():
    if os.name != 'nt':
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Run') as key:
            return bool(winreg.QueryValueEx(key, 'K02DocumentManager')[0])
    except OSError:
        return False


def set_startup(enabled):
    if os.name != 'nt':
        raise RuntimeError('Chỉ hỗ trợ Windows')
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Run', 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            cmd = f'"{sys.executable}" "{Path(__file__).resolve()}" --startup' if not getattr(sys, 'frozen', False) else f'"{sys.executable}" --startup'
            winreg.SetValueEx(key, 'K02DocumentManager', 0, winreg.REG_SZ, cmd)
        else:
            try:
                winreg.DeleteValue(key, 'K02DocumentManager')
            except FileNotFoundError:
                pass


# Cong cu lien ket file: chi quan ly duong dan, KHONG sao chep du lieu.
def _linked_file(raw, parent):
    raw = (raw or '').strip().strip('"')
    if not raw:
        messagebox.showwarning('File đính kèm', 'Chưa có đường dẫn file.', parent=parent)
        return None
    p = Path(os.path.expandvars(os.path.expanduser(raw)))
    if not p.is_absolute():
        p = ROOT / p
    return p


def linked_file_action(raw, parent, action='check'):
    p = _linked_file(raw, parent)
    if p is None:
        return False
    try:
        if not p.is_file():
            messagebox.showwarning('Liên kết file',
                'Không tìm thấy file tại đường dẫn đã lưu:\n' + str(p) +
                '\n\nHãy chọn lại file để cập nhật đường dẫn.', parent=parent)
            return False
        if action == 'open':
            if sys.platform == 'win32':
                os.startfile(str(p))
            else:
                import subprocess
                subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(p)])
        elif action == 'folder':
            if sys.platform == 'win32':
                import subprocess
                subprocess.Popen(['explorer', '/select,', str(p)])
            else:
                import subprocess
                subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(p.parent)])
        else:
            messagebox.showinfo('Kiểm tra file', 'File tồn tại:\n' + str(p), parent=parent)
        return True
    except (OSError, ValueError) as exc:
        messagebox.showerror('Không thể truy cập file', str(exc), parent=parent)
        return False


def list_categories(table, active_only=True):
    if table not in ('document_types', 'work_fields'):
        raise ValueError('Danh mục không hợp lệ')
    with db_session() as c:
        return c.execute(f'SELECT id,name FROM {table} ' + ('WHERE active=1 ' if active_only else '') + 'ORDER BY name COLLATE NOCASE').fetchall()


def effective_status(doc, today=None):
    today = today or date.today()
    if doc['expiry_date'] and doc['expiry_date'] <= today.isoformat():
        return 'Hết hiệu lực'
    return doc['effect_status'] or 'Cần rà soát'


def manage_category(parent, table, on_change=None):
    window = tk.Toplevel(parent)
    window.title('Quản lý loại văn bản' if table == 'document_types' else 'Quản lý lĩnh vực')
    window.geometry('420x410')
    window.transient(parent)
    frame = ttk.Frame(window, padding=12)
    frame.pack(fill='both', expand=True)
    lb = tk.Listbox(frame, height=14)
    lb.pack(fill='both', expand=True)
    name = ttk.Entry(frame)
    name.pack(fill='x', pady=8)
    records = []
    def reload():
        nonlocal records
        records = list(list_categories(table, False))
        lb.delete(0, 'end')
        with db_session() as c:
            states = {r['id']: r['active'] for r in c.execute(f'SELECT id,active FROM {table}')}
        for r in records:
            lb.insert('end', r['name'] + ('' if states[r['id']] else ' [Ngừng sử dụng]'))
        if on_change: on_change()
    def selected():
        idx = lb.curselection()
        return records[idx[0]] if idx else None
    def on_select(_=None):
        r = selected()
        if r:
            name.delete(0, 'end'); name.insert(0, r['name'])
    lb.bind('<<ListboxSelect>>', on_select)
    def save(new=False):
        value = name.get().strip()
        if not value:
            messagebox.showwarning('Danh mục', 'Hãy nhập tên.', parent=window); return
        try:
            with db_session() as c:
                if new:
                    c.execute(f'INSERT INTO {table}(name) VALUES(?)', (value,))
                else:
                    r = selected()
                    if not r: return
                    c.execute(f'UPDATE {table} SET name=? WHERE id=?', (value, r['id']))
            reload()
        except sqlite3.IntegrityError:
            messagebox.showwarning('Danh mục', 'Tên đã tồn tại.', parent=window)
    def toggle():
        r = selected()
        if r:
            with db_session() as c:
                c.execute(f'UPDATE {table} SET active=1-active WHERE id=?', (r['id'],))
            reload()
    actions = ttk.Frame(frame); actions.pack(fill='x')
    ttk.Button(actions, text='Thêm mới', command=lambda: save(True)).pack(side='left')
    ttk.Button(actions, text='Đổi tên', command=save).pack(side='left', padx=4)
    ttk.Button(actions, text='Bật / Ngừng', command=toggle).pack(side='left')
    reload()
    return window


class Editor(tk.Toplevel):
    def __init__(self, app, doc_id=None):
        super().__init__(app)
        self.app, self.doc_id = app, doc_id
        self.title('Chỉnh sửa văn bản' if doc_id else 'Thêm văn bản')
      
        width = 820 # Kích thước Khung Chỉnh sửa văn bản
        height = 600 #Chiều cao
        x = (self.winfo_screenwidth() - width) // 2
        y = 25 #Cách mép trên windows
        #y = (self.winfo_screenheight() - height) // 2
        self.geometry(f'{width}x{height}+{x}+{y}')
        self.minsize(820, 480)
        self.transient(app)
        self.grab_set()
        self.entries = {}
        outer = ttk.Frame(self)
        outer.pack(fill='both', expand=True)
        canvas = tk.Canvas(outer, highlightthickness=0)
        scrollbar = ttk.Scrollbar(outer, orient='vertical', command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side='right', fill='y')
        # Canvas được pack sau thanh nút cố định ở cuối __init__.
        footer = ttk.Frame(outer, padding=(10, 5))
        footer.pack(side='bottom', fill='x')
        canvas.pack(side='left', fill='both', expand=True)
        body = ttk.Frame(canvas, padding=12)
        win_id = canvas.create_window((0, 0), window=body, anchor='nw')
        body.bind('<Configure>', lambda e: canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.bind('<Configure>', lambda e: canvas.itemconfigure(win_id, width=e.width))
        body.columnconfigure(1, weight=1)
        body.columnconfigure(2, weight=1)
        body.columnconfigure(3, weight=1)

        top = ttk.Frame(body)
        top.grid(row=0, column=0, columnspan=4, sticky='ew', pady=(0, 6))
        # Hàng 1 dùng khung riêng để khoảng cách Ký hiệu không phụ thuộc
        # vào chiều rộng ô Loại văn bản ở hàng 2.
        first_row = ttk.Frame(top)
        first_row.grid(row=0, column=0, columnspan=9, sticky='ew')
        for col in (1, 3, 5, 7):
            first_row.columnconfigure(col, weight=1)
        for col, key, label in ((0, 'issued', 'Ngày ban hành'), (2, 'number', 'Số văn bản'),
                                (4, 'symbol', 'Ký hiệu'), (6, 'security_level', 'Độ mật')):
            ttk.Label(first_row, text=label).grid(row=0, column=col, sticky='w', padx=(0, 4))
            if key == 'symbol': ent = ttk.Combobox(first_row, width=14)
            elif key == 'security_level':
                ent = ttk.Combobox(first_row, values=SECURITY_LEVELS, state='readonly', width=12)
                ent.set('Thường')
            else: ent = ttk.Entry(first_row, width=12)
            ent.grid(row=0, column=col+1, sticky='ew', padx=(0, 10 if col != 6 else 0))
            self.entries[key] = ent
        # ================================================================
        # TU CHINH BO CUC HANG 2 VA HANG 3 (KHUNG top)
        # ================================================================
        # Cac cot (column) dung chung cho HANG 2 va HANG 3:
        #   cot 0: nhan Co quan ky / Trang thai hieu luc
        #   cot 1-2: o Co quan ky / o Trang thai hieu luc
        #   cot 3: nhan Loai van ban / nhan Ngay het hieu luc
        #   cot 4: o Loai van ban / o Ngay het hieu luc
        #   cot 5: nut + Loai van ban / phan cuoi o Ngay het hieu luc
        #   cot 6: nhan Linh vuc / ghi chu dinh dang ngay
        #   cot 7: o Linh vuc / ghi chu dinh dang ngay
        #   cot 8: nut + Linh vuc / ghi chu dinh dang ngay
        # weight: ti le nhan phan dien tich DU khi keo rong cua so.
        # minsize: chieu rong TOI THIEU cua cot, don vi pixel.
        # LUU Y: doi minsize o day se anh huong DONG THOI ca hai hang.
        # De doi khoang cach rieng mot widget, sua padx/pady o lenh .grid().
        # Cột 1–2: Cơ quan ký / Trạng thái hiệu lực
        top.columnconfigure(1, weight=0, minsize=145)
        top.columnconfigure(2, weight=0, minsize=20)

        # Cột 3: Loại văn bản / Ngày hết hiệu lực
        top.columnconfigure(3, weight=0, minsize=105)

        # Cột 4: Ô nhập
        top.columnconfigure(4, weight=1, minsize=116)

        # Cột 7: Lĩnh vực
        top.columnconfigure(7, weight=1, minsize=116)
        with db_session() as c:
            symbols = [r[0] for r in c.execute("SELECT DISTINCT symbol FROM documents WHERE TRIM(symbol)<>'' ORDER BY symbol")]
            agencies = [r[0] for r in c.execute("SELECT DISTINCT agency FROM documents WHERE TRIM(agency)<>'' ORDER BY agency")]
        self.entries['symbol']['values'] = symbols
        # ---------------- HANG 2 (row=1) ----------------
        # pady=(7,0): cach hang 1 7px; sticky='w': can trai.
        ttk.Label(top, text='Cơ quan ký').grid(row=1, column=0, sticky='w', pady=(7,0))
        # width=22: do rong goi y tinh bang KY TU (sticky='ew' se gian theo cot).
        agency = ttk.Combobox(top, values=agencies, width=22)
        # column=1, columnspan=2: o Co quan ky chiem cot 1 VA 2.
        # padx=(2,38): lùi ô sang phải 2px, rút mép phải vào 30px so với trước.
        # Muốn ngắn thêm: tăng 38; muốn rộng hơn: giảm 38.
        agency.grid(row=1, column=1, columnspan=2, sticky='ew', pady=(7,0), padx=(2,15))
        self.entries['agency'] = agency
        # Cot 3: nhan Loai van ban; muon day sang phai, co the them padx=(8,0).
        ttk.Label(top, text='Loại văn bản').grid(row=1, column=3, sticky='w', pady=(7,0))
        self.type_var = tk.StringVar(value='Chưa phân loại')
        self.type_combo = ttk.Combobox(top, textvariable=self.type_var, state='readonly', width=17)
        # Cot 4: o chon Loai van ban; width=17 o tren la do rong theo ky tu.
        self.type_combo.grid(row=1, column=4, sticky='ew', pady=(7,0))
        ttk.Button(top, text='+', width=2, command=lambda: manage_category(self, 'document_types', self.reload_categories)).grid(row=1,column=5,sticky='w',pady=(7,0))
        # Cot 6: nhan Linh vuc; cot 7: o chon; cot 8: nut +.
        ttk.Label(top, text='Lĩnh vực').grid(  row=1, column=6, sticky='w', pady=(7,0), # Giữ nguyên độ cao hàng
        padx=(10,5)   # padx=(10,5): Tạo khoảng cách 10px bên trái và 5px bên phải.
        ) 
        self.fields_button = ttk.Combobox(top, state='readonly', width=18)
        self.fields_button.grid(row=1,column=7,sticky='ew',pady=(7,0))
        self.fields_button.bind('<<ComboboxSelected>>', self.choose_fields)
        ttk.Button(top,text='+',width=2,command=lambda:manage_category(self,'work_fields',self.reload_categories)).grid(row=1,column=8,pady=(7,0))
        self.selected_field_ids = set()
        self.reload_categories()
        # ---------------- HANG 3 (row=2) ----------------
        # Cot 0: nhan Trang thai hieu luc.
        ttk.Label(top,text='Trạng thái hiệu lực').grid(row=2,column=0,sticky='w',pady=(7,0),padx=(0,5))
        self.effect_var = tk.StringVar(value='Cần rà soát')
        # Cot 1-2: cùng mép với Cơ quan ký; trái +2px, phải rút vào 30px.
        # Điều chỉnh (2,38) để thay đổi đồng thời vị trí và độ rộng ô.
        ttk.Combobox(top,textvariable=self.effect_var,values=VALID_STATUSES,state='readonly',width=19).grid(row=2,column=1,columnspan=2,sticky='ew',pady=(7,0),padx=(2,48))
        # Cot 3: nhan Ngay het hieu luc. Neu bi cat chu, tang minsize cot 3.
        ttk.Label(top,text='Ngày hết hiệu lực').grid(row=2,column=3,sticky='w',pady=(7,0))
        # Cot 4-5: o nhap ngay; muon day o sang phai co the them padx=(8,8),
        # nhung se giam do rong phan nhap, khong doi vi tri cac cot khac.
        self.expiry_entry = ttk.Entry(top,width=17)
        self.expiry_entry.grid(row=2,column=4,columnspan=2,sticky='ew',pady=(7,0),padx=(0,8))
        # Cot 6-8: chu thich dinh dang ngay.
        ttk.Label(top,text='(dd/mm/yyyy, có thể để trống)').grid(row=2,column=6,columnspan=3,sticky='w',pady=(7,0))
        for row, key, label, height in (
            (1, 'summary', 'Trích yếu nội dung', EDITOR_SUMMARY_LINES),
            (2, 'notes', 'Chú thích trọng tâm', EDITOR_NOTES_LINES),
        ):
            ttk.Label(body, text=label).grid(row=row, column=0, sticky='nw', pady=3)
            frame = ttk.Frame(body)
            frame.grid(row=row, column=1, columnspan=3, sticky='nsew', pady=2)
            txt = tk.Text(frame, height=height, wrap='word', font=('Segoe UI', 10), undo=True)
            scroll = ttk.Scrollbar(frame, command=txt.yview)
            txt.configure(yscrollcommand=scroll.set)
            txt.pack(side='left', fill='both', expand=True)
            scroll.pack(side='right', fill='y')
            self.entries[key] = txt

        ttk.Label(body, text='File đính kèm').grid(row=3, column=0, sticky='nw', pady=5)
        attachment_frame = ttk.Frame(body)
        attachment_frame.grid(row=3, column=1, columnspan=3, sticky='ew')
        attachment_frame.columnconfigure(0, weight=1)

        # tk.Text hỗ trợ nhiều dòng, tự xuống dòng khi đường dẫn quá dài.
        # Dữ liệu vẫn lưu là một chuỗi đường dẫn, không chèn dấu xuống dòng.
        ent = tk.Text(attachment_frame, height=EDITOR_ATTACHMENT_LINES,
                      wrap='char', font=('Segoe UI', 9), undo=True)
        ent.grid(row=0, column=0, sticky='ew')
        attachment_scroll = ttk.Scrollbar(attachment_frame, orient='vertical', command=ent.yview)
        attachment_scroll.grid(row=0, column=1, sticky='ns')
        ent.configure(yscrollcommand=attachment_scroll.set)
        self.entries['attachment'] = ent
        file_tools = ttk.Frame(attachment_frame)
        file_tools.grid(row=1, column=0, columnspan=3, sticky='w', pady=(4, 0))
        for label, action in [('Mở file', 'open'), ('Mở thư mục', 'folder'),
                              ('Kiểm tra', 'check')]:
            ttk.Button(file_tools, text=label,
                command=lambda a=action: linked_file_action(self.get_field('attachment'), self, a)).pack(
                    side='left', padx=(0, 5))
        ttk.Button(file_tools, text='Cập nhật đường dẫn',
            command=self.choose_attachment).pack(side='left')
        # Can giua nut theo chieu cao o duong dan dinh kem.
        tk.Button(attachment_frame, text='Chọn file', command=self.choose_attachment,
                  bg='#98C6F1', activebackground='#A9D0F5', fg='#163C70',
                  activeforeground='#163C70', font=('Segoe UI', 10, 'bold'),
                  relief='flat', bd=1, padx=12, pady=5, cursor='hand2').grid(
            row=0, column=2, padx=(8, 0))
        self.entries['issued'].insert(0, date.today().strftime('%d/%m/%Y'))
        amend_frame = ttk.Frame(body)
        amend_frame.grid(row=4,column=0,columnspan=4,sticky='ew',pady=(7,4))
        ttk.Label(amend_frame,text='Được sửa đổi, bổ sung bởi').pack(side='left',padx=(0,8))
        self.amend_entry = ttk.Entry(amend_frame, width=46)
        self.amend_entry.pack(side='left',fill='x',expand=True)
        self.amend_ids = set()
        ttk.Button(amend_frame,text='Chọn văn bản...',command=self.choose_amendments).pack(side='left',padx=5)
        ttk.Separator(body).grid(row=5, column=0, columnspan=4, sticky='ew', pady=6)
        ttk.Label( body, text='THỜI HẠN BÁO CÁO', font=('Segoe UI', 15, 'bold'),
        foreground='#CC0000' ).grid(  row=6, column=0, columnspan=4, pady=(0, 4) )
        self.schedule_vars = {}
        def schedule(parent, kind, row, col=0):
            # Mỗi mục là một khung độc lập với 3 cột: nhãn | ngày | kiểu lặp.
            # Dòng gợi ý nằm BÊN DƯỚI ô ngày, tránh chen vào giữa hai mục.
            frame = ttk.Frame(parent)
            frame.grid(row=row, column=col, sticky='ew', padx=(0, 12), pady=(3, 5))
            frame.columnconfigure(1, weight=1)
            enabled = tk.BooleanVar()
            ttk.Checkbutton(frame, text=kind, variable=enabled, width=11).grid(
                row=0, column=0, sticky='w', padx=(0, 5))
            entry = ttk.Entry(frame, width=18)
            entry.grid(row=0, column=1, sticky='ew', padx=(0, 7))
            rule = ttk.Combobox(frame, state='readonly', width=11,
                                values=['Hằng tháng', 'Hằng năm'] if kind.startswith('Định kỳ') else REPEATS)
            rule.set('Hằng tháng' if kind.startswith('Định kỳ') else 'Không lặp')
            year = ttk.Entry(frame, width=7)
            if kind == 'Sắp tới':
                hint = 'dd/mm/yyyy'
            else:
                rule.grid(row=0, column=2, sticky='w')
                if kind in ('Sơ kết', 'Tổng kết'):
                    year.grid(row=0, column=3, padx=(7, 0))
                    hint = 'dd/mm/yyyy, mm/yyyy, yyyy hoặc dd/mm'
                else:
                    hint = 'Hằng tháng: 1–31 | Hằng năm: dd/mm'
            ttk.Label(frame, text=hint, foreground='#555').grid(
                row=1, column=1, columnspan=3, sticky='w', pady=(2, 0))
            self.schedule_vars[kind] = (enabled, entry, rule, year)
            return frame

        # Two equal columns for deadline controls. The first 'Sắp tới'
        # ends at the same vertical boundary as Định kỳ 1.
        deadlines = ttk.Frame(body)
        deadlines.grid(row=7, column=0, columnspan=4, sticky='ew')
        deadlines.columnconfigure(0, weight=1, uniform='deadline')
        deadlines.columnconfigure(1, weight=1, uniform='deadline')
        schedule(deadlines, 'Sắp tới', 0, 0)
        # Định kỳ 1 nằm cùng hàng với Sắp tới, không chiếm hàng riêng.
        schedule(deadlines, 'Định kỳ 1', 0, 1)

        # Có thể bổ sung nhiều mục định kỳ cho cùng một văn bản.
        periodic_header = ttk.Frame(body)
        periodic_header.grid(row=8, column=0, columnspan=4, sticky='ew', pady=(5, 0))
        ttk.Label(periodic_header, text='BÁO CÁO ĐỊNH KỲ').pack(side='left')
        ttk.Button(periodic_header, text='+ Thêm định kỳ',
                   command=self.add_periodic_schedule).pack(side='left', padx=(10, 0))
        self.periodic_container = ttk.Frame(body)
        self.periodic_container.grid(row=9, column=0, columnspan=4, sticky='ew')
        self.periodic_container.columnconfigure(0, weight=1, uniform='periodic')
        self.periodic_container.columnconfigure(1, weight=1, uniform='periodic')
        self.periodic_rows = {}
        self.hidden_periodic = set()  # Các kỳ cũ vẫn được nạp nhưng ẩn đến khi nhấn +
        self._periodic_schedule_builder = schedule
        # Các kỳ từ Định kỳ 2 trở đi chỉ xuất hiện khi bấm '+ Thêm định kỳ'
        # hoặc khi mở văn bản cũ đã có các kỳ tương ứng.

        summaries = ttk.Frame(body)
        summaries.grid(row=10, column=0, columnspan=4, sticky='ew')
        summaries.columnconfigure(0, weight=1, uniform='deadline')
        summaries.columnconfigure(1, weight=1, uniform='deadline')
        schedule(summaries, 'Sơ kết', 0, 0)
        schedule(summaries, 'Tổng kết', 0, 1)

        ttk.Label(body, text='Ô năm cuối của Sơ kết/Tổng kết: chỉ theo dõi năm đó, không lặp.',
                  foreground='#555').grid(row=11, column=0, columnspan=4, sticky='w', pady=(2, 0))
        buttons = footer
        # Giữ thanh nút bên ngoài canvas cuộn, luôn hiển thị khi cửa sổ thấp.
        tk.Button(buttons, text='LƯU VĂN BẢN', command=self.save,
                  bg='#A2F0B5', activebackground='#A9DEB8', fg='#163A2C',
                  activeforeground='#163A2C', font=('Segoe UI', 10, 'bold'),
                  relief='flat', bd=1, padx=12, pady=5, cursor='hand2').pack(side='left', padx=8)
        tk.Button(buttons, text='HỦY', command=self.destroy,
                  bg='#FA9E9E', activebackground='#EDAAAA', fg='#6B2020',
                  activeforeground='#6B2020', font=('Segoe UI', 10, 'bold'),
                  relief='flat', bd=1, padx=12, pady=5, cursor='hand2').pack(side='left')
        if doc_id:
            self.load()

    def add_periodic_schedule(self, kind=None):
        """Thêm một kỳ báo cáo độc lập, không giới hạn ở hai mục mặc định."""
        if kind is None:
            # Ưu tiên hiện lại kỳ đã có trong văn bản cũ, không tạo bản trùng.
            if self.hidden_periodic:
                old_kind = min(self.hidden_periodic, key=lambda k: int(k.split()[-1]))
                self.hidden_periodic.remove(old_kind)
                self.periodic_rows[old_kind].grid()
                self._reflow_periodic_rows()
                return
            index = 2
            while f'Định kỳ {index}' in self.schedule_vars:
                index += 1
            kind = f'Định kỳ {index}'
        if kind in self.schedule_vars:
            return
        position = len(self.periodic_rows)
        row, col = divmod(position, 2)
        wrapper = ttk.Frame(self.periodic_container)
        wrapper.grid(row=row, column=col, sticky='ew', padx=(0, 8), pady=2)
        wrapper.columnconfigure(0, weight=1)
        self._periodic_schedule_builder(wrapper, kind, 0, 0)
        if kind != 'Định kỳ 1':
            ttk.Button(wrapper, text='×', width=2,
                       command=lambda k=kind: self.remove_periodic_schedule(k)).grid(
                           row=0, column=1, padx=(3, 0))
        self.periodic_rows[kind] = wrapper
        self._reflow_periodic_rows()

    def _reflow_periodic_rows(self):
        visible = [(kind, wrapper) for kind, wrapper in self.periodic_rows.items()
                   if kind not in self.hidden_periodic]
        for position, (_, wrapper) in enumerate(visible):
            row, col = divmod(position, 2)
            wrapper.grid_configure(row=row, column=col)

    def remove_periodic_schedule(self, kind):
        """Xóa mục bổ sung khỏi biểu mẫu; chỉ cập nhật DB khi Lưu văn bản."""
        if kind not in self.periodic_rows:
            return
        if self.doc_id:
            with db_session() as c:
                record = c.execute(
                    'SELECT id FROM schedules WHERE document_id=? AND kind=?',
                    (self.doc_id, kind)).fetchone()
                completed = (c.execute(
                    'SELECT COUNT(*) FROM report_history WHERE schedule_id=? AND completed_date IS NOT NULL',
                    (record['id'],)).fetchone()[0] if record else 0)
            if completed and not messagebox.askyesno(
                    'Xóa thời hạn báo cáo',
                    f'{kind} có {completed} kỳ đã hoàn thành.\\n'
                    'Nếu lưu thay đổi, lịch sử các kỳ này cũng sẽ bị xóa.\\n'
                    'Bạn có chắc muốn tiếp tục?', parent=self):
                return
        self.periodic_rows[kind].destroy()
        del self.periodic_rows[kind]
        self.hidden_periodic.discard(kind)
        del self.schedule_vars[kind]
        self._reflow_periodic_rows()

    def reload_categories(self):
        self.types = list(list_categories('document_types', False))
        self.type_combo['values'] = ['Chưa phân loại'] + [r['name'] for r in self.types]
        self.update_fields_label()

    def update_fields_label(self):
        """Hiển thị các lĩnh vực đã chọn bằng Combobox giống Loại văn bản."""
        records = list(list_categories('work_fields'))
        self._field_option_ids = [r['id'] for r in records]
        self.fields_button['values'] = [
            ('☑ ' if r['id'] in self.selected_field_ids else '☐ ') + r['name']
            for r in records
        ]
        names = [r['name'] for r in records if r['id'] in self.selected_field_ids]
        self.fields_button.set('; '.join(names) if names else 'Chưa phân loại')

    def choose_fields(self, event=None):
        """Chọn/bỏ chọn nhiều lĩnh vực trực tiếp trong danh sách xổ của Combobox.

        Dấu ☑ đánh dấu mục đã chọn; chọn tiếp mục khác để thêm, chọn lại để bỏ.
        """
        index = self.fields_button.current()
        if index < 0 or index >= len(self._field_option_ids):
            return
        field_id = self._field_option_ids[index]
        if field_id in self.selected_field_ids:
            self.selected_field_ids.remove(field_id)
        else:
            self.selected_field_ids.add(field_id)
        self.update_fields_label()

    def choose_amendments(self):
        win=tk.Toplevel(self);win.title('Liên kết văn bản sửa đổi, bổ sung');win.geometry('620x420');win.transient(self)
        q=tk.StringVar();ttk.Entry(win,textvariable=q).pack(fill='x',padx=10,pady=6)
        lb=tk.Listbox(win,selectmode='multiple');lb.pack(fill='both',expand=True,padx=10)
        with db_session() as c:
            rows=c.execute('SELECT id,number,symbol,summary FROM documents WHERE id!=? ORDER BY issued DESC',(self.doc_id or '',)).fetchall()
        current=[]
        def populate(*_):
            current.clear();lb.delete(0,'end')
            for r in rows:
                label=f"{r['number']}/{r['symbol']} - {r['summary']}"
                if search_key(q.get()) in search_key(label):
                    current.append(r['id']);lb.insert('end',label)
            for i,doc_id in enumerate(current):
                if doc_id in self.amend_ids: lb.selection_set(i)
        q.trace_add('write',populate);populate()
        def apply():
            visible=set(current)
            self.amend_ids.difference_update(visible)
            self.amend_ids.update(current[i] for i in lb.curselection())
            win.destroy()
        ttk.Button(win,text='Áp dụng',command=apply).pack(pady=6)

    def get_field(self,key):
        widget=self.entries[key]
        value = (widget.get('1.0','end-1c') if isinstance(widget,tk.Text) else widget.get()).strip()
        return value.replace('\n', '').replace('\r', '') if key == 'attachment' else value

    def put_field(self,key,value):
        widget=self.entries[key]
        if isinstance(widget,tk.Text):
            widget.delete('1.0','end')
            widget.insert('1.0',value or '')
        else:
            widget.delete(0,'end')
            widget.insert(0,value or '')

    def choose_attachment(self):
        path=filedialog.askopenfilename(parent=self)
        if path:self.put_field('attachment',path)

    def load(self):
        with db_session() as c:
            d=c.execute('SELECT * FROM documents WHERE id=?',(self.doc_id,)).fetchone()
            if not d:
                self.destroy()
                return
            for key in self.entries:
                value = d[key] if key in d.keys() else ('Thường' if key == 'security_level' else '')
                self.put_field(key,display_date(value) if key=='issued' else value)
            self.type_var.set(next((r['name'] for r in self.types if r['id']==d['type_id']), 'Chưa phân loại'))
            self.effect_var.set(d['effect_status'] or 'Cần rà soát')
            self.expiry_entry.insert(0, display_date(d['expiry_date']) if d['expiry_date'] else '')
            self.amend_entry.insert(0,d['amendment_text'] or '')
            self.selected_field_ids={r[0] for r in c.execute('SELECT field_id FROM document_fields WHERE document_id=?',(self.doc_id,))}
            self.amend_ids={r[0] for r in c.execute('SELECT amendment_id FROM document_amendments WHERE document_id=?',(self.doc_id,))}
            self.update_fields_label()
            for s in c.execute('SELECT * FROM schedules WHERE document_id=?',(self.doc_id,)):
                if s['kind'] not in self.schedule_vars and s['kind'].startswith('Định kỳ'):
                    self.add_periodic_schedule(s['kind'])
                    # Giữ dữ liệu để Lưu không xóa lịch cũ, nhưng chưa hiển thị.
                    self.hidden_periodic.add(s['kind'])
                    self.periodic_rows[s['kind']].grid_remove()
                if s['kind'] not in self.schedule_vars:
                    continue
                enabled,entry,rule,year=self.schedule_vars[s['kind']]
                enabled.set(True)
                if s['kind'].startswith('Định kỳ'):
                    if s['repeat_rule']=='Hằng năm':
                        d0=date.fromisoformat(s['start_date'])
                        entry.insert(0,f'{s["day_of_month"]:02d}/{d0.month:02d}')
                        rule.set('Hằng năm')
                    else:
                        entry.insert(0,str(s['day_of_month']))
                        rule.set('Hằng tháng')
                else:
                    raw = s['start_date']
                    repeat = s['repeat_rule']
                    if s['kind'] in ('Sơ kết', 'Tổng kết') and s['precision'] == 'day' and raw and len(raw) == 10:
                        d0 = date.fromisoformat(raw)
                        if repeat == 'Hằng năm':
                            entry.insert(0, d0.strftime('%d/%m'))
                        elif repeat == 'Không lặp' and d0.year != date.fromisoformat(d['issued']).year:
                            entry.insert(0, d0.strftime('%d/%m'))
                            year.insert(0, str(d0.year))
                        else:
                            entry.insert(0, period_label(raw))
                    else:
                        entry.insert(0, period_label(raw))
                    if repeat.startswith('Năm:'):
                        year.insert(0, repeat.split(':',1)[1])
                        rule.set('Không lặp')
                    elif repeat in REPEATS:
                        rule.set(repeat)
                    else:
                        rule.set('Không lặp')

    def save(self):
        try:
            values={k:self.get_field(k) for k in self.entries}
            issued=parse_date(values['issued'])
            if values['security_level'] not in SECURITY_LEVELS:
                raise ValueError('Độ mật không hợp lệ')
            if not all(values[k] for k in ('number','symbol','agency','summary')):
                raise ValueError('Vui lòng nhập số, ký hiệu, cơ quan ký và trích yếu')
            type_id = next((r['id'] for r in self.types if r['name']==self.type_var.get()), None)
            expiry = parse_date(self.expiry_entry.get(), optional=True)
            status = self.effect_var.get()
            if status not in VALID_STATUSES: raise ValueError('Trạng thái hiệu lực không hợp lệ')
            schedules=[]
            for kind,(enabled,entry,rule,year) in self.schedule_vars.items():
                if not enabled.get():continue
                v=entry.get().strip()
                if kind.startswith('Định kỳ'):
                    if rule.get()=='Hằng năm':
                        try:
                            parts=v.split('/')
                            if len(parts)!=2 or not all(x.isdigit() for x in parts):
                                raise ValueError()
                            day, month = map(int, parts)
                            date(2000,month,day)
                        except ValueError:
                            raise ValueError(f'{kind}: nhập dd/mm hợp lệ, ví dụ 15/10')
                        start=date(issued.year,month,min(day,calendar.monthrange(issued.year,month)[1]))
                        if start < issued:
                            start=date(issued.year+1,month,min(day,calendar.monthrange(issued.year+1,month)[1]))
                        schedules.append((kind,start.isoformat(),day,'Hằng năm','day'))
                    else:
                        if not v:
                            raise ValueError(f'{kind}: đã tích chọn nhưng chưa nhập ngày (1–31)')
                        if not v.isdigit():
                            raise ValueError(f'{kind}: ngày hằng tháng phải là số từ 1 đến 31')
                        day=int(v)
                        if not 1<=day<=31:raise ValueError(f'{kind}: ngày phải từ 1 đến 31')
                        schedules.append((kind,issued.isoformat(),day,'Hằng tháng','day'))
                else:
                    if kind=='Sắp tới':
                        d=parse_date(v)
                        schedules.append((kind,d.isoformat(),None,'Không lặp','day'))
                    else:
                        repeat = rule.get()
                        year_text = year.get().strip()
                        if year_text:
                            if not (year_text.isdigit() and len(year_text) == 4 and 1900 <= int(year_text) <= 9999):
                                raise ValueError(f'{kind}: ô năm phải gồm 4 chữ số hợp lệ')
                            fixed_year = int(year_text)
                            # Năm nhập riêng có ưu tiên cao nhất: không tạo kỳ lặp.
                            if len(v.split('/')) == 2 and all(part.isdigit() for part in v.split('/')) and len(v.split('/')[1]) <= 2:
                                try:
                                    day, month = map(int, v.split('/'))
                                    fixed = date(fixed_year, month, day)
                                except ValueError:
                                    raise ValueError(f'{kind}: ngày/tháng không hợp lệ trong năm {fixed_year}')
                                start, precision = fixed.isoformat(), 'day'
                            else:
                                try:
                                    start, precision = parse_flexible_date(v, annual=False)
                                except ValueError as exc:
                                    raise ValueError(f'{kind}: {exc}')
                                if precision == 'year':
                                    start = str(fixed_year)
                                elif precision == 'month':
                                    start = f'{fixed_year:04d}-{start[5:7]}'
                                else:
                                    d0 = date.fromisoformat(start)
                                    try:
                                        start = d0.replace(year=fixed_year).isoformat()
                                    except ValueError:
                                        raise ValueError(f'{kind}: ngày không tồn tại trong năm {fixed_year}')
                            repeat = 'Không lặp'
                        else:
                            if repeat == 'Hằng năm' and len(v.split('/')) == 2 and all(part.isdigit() for part in v.split('/')) and len(v.split('/')[1]) <= 2:
                                try:
                                    day, month = map(int, v.split('/'))
                                    date(2000, month, day)
                                    start = date(issued.year, month, min(day, calendar.monthrange(issued.year, month)[1])).isoformat()
                                    precision = 'day'
                                except ValueError:
                                    raise ValueError(f'{kind}: ngày/tháng không hợp lệ')
                            else:
                                try:
                                    start, precision = parse_flexible_date(v, annual=(repeat == 'Hằng năm'), base_year=issued.year)
                                except ValueError as exc:
                                    raise ValueError(f'{kind}: {exc}')
                        schedules.append((kind,start,None,repeat,precision))
            doc_id=self.doc_id or str(uuid.uuid4())
            with db_session() as c:
                # 3.5.10: Canh bao trung truoc khi ghi du lieu. Loai tru chinh van ban dang sua.
                # So/ky hieu duoc so sanh khong phan biet dau, hoa/thuong va khoang trang.
                entered_number = search_key(values['number']).strip()
                entered_symbol = search_key(values['symbol']).strip()
                duplicates = []
                for other in c.execute(
                    'SELECT id, issued, number, symbol, agency, summary FROM documents WHERE id != ?',
                    (doc_id,)
                ).fetchall():
                    if (search_key(other['number']).strip() == entered_number
                            and search_key(other['symbol']).strip() == entered_symbol):
                        duplicates.append(other)
                if duplicates:
                    same_date = [r for r in duplicates if r['issued'] == issued.isoformat()]
                    same_agency = [r for r in duplicates if search_key(r['agency']).strip() == search_key(values['agency']).strip()]
                    # Uu tien ban ghi cung ngay ban hanh, sau do cung co quan.
                    duplicates.sort(key=lambda r: (
                        r['issued'] != issued.isoformat(),
                        search_key(r['agency']).strip() != search_key(values['agency']).strip()
                    ))
                    examples = []
                    for r in duplicates[:4]:
                        summary = ' '.join((r['summary'] or '').split())
                        if len(summary) > 95:
                            summary = summary[:92] + '...'
                        examples.append(
                            f"• {r['number']}/{r['symbol']} | {display_date(r['issued'])}\n"
                            f"  {r['agency']}\n  {summary}"
                        )
                    severity = ('Trùng số, ký hiệu VÀ ngày ban hành.' if same_date
                                else 'Trùng số và ký hiệu (ngày ban hành khác).')
                    message = (
                        'PHÁT HIỆN VĂN BẢN CÓ KHẢ NĂNG TRÙNG!\n\n'
                        + severity + '\n'
                        + f"Số/ký hiệu đang nhập: {values['number']}/{values['symbol']}\n"
                        + f"Ngày ban hành: {issued:%d/%m/%Y}\n\n"
                        + 'Văn bản đã có trong hệ thống:\n'
                        + '\n\n'.join(examples)
                        + (f"\n\n... và {len(duplicates)-4} văn bản khác." if len(duplicates)>4 else '')
                        + '\n\nBạn có chắc vẫn muốn lưu văn bản này?'
                    )
                    if not messagebox.askyesno('Cảnh báo văn bản trùng', message,
                                               icon='warning', parent=self, default='no'):
                        return
                before_change = document_snapshot(c, doc_id)
                c.execute("""INSERT INTO documents(id,issued,number,symbol,agency,summary,notes,attachment,updated,security_level,type_id,effect_status,expiry_date,amendment_text)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                  issued=excluded.issued,number=excluded.number,symbol=excluded.symbol,
                  agency=excluded.agency,summary=excluded.summary,notes=excluded.notes,
                  attachment=excluded.attachment,updated=excluded.updated,
                  security_level=excluded.security_level,type_id=excluded.type_id,effect_status=excluded.effect_status,expiry_date=excluded.expiry_date,amendment_text=excluded.amendment_text""",
                  (doc_id,issued.isoformat(),values['number'],values['symbol'],values['agency'],
                   values['summary'],values['notes'],values['attachment'],datetime.now().isoformat(),values['security_level'],type_id,status,expiry.isoformat() if expiry else None,self.amend_entry.get().strip()))
                existing={r['kind']:r for r in c.execute('SELECT * FROM schedules WHERE document_id=?',(doc_id,))}
                selected={s[0] for s in schedules}
                for kind,old in existing.items():
                    if kind not in selected:c.execute('DELETE FROM schedules WHERE id=?',(old['id'],))
                for kind,start,day,repeat,precision in schedules:
                    old=existing.get(kind)
                    if old:
                        if (old['start_date'],old['day_of_month'],old['repeat_rule'],old['precision']) != (start,day,repeat,precision):
                            c.execute('UPDATE schedules SET start_date=?,day_of_month=?,repeat_rule=?,precision=? WHERE id=?',
                                      (start,day,repeat,precision,old['id']))
                            c.execute('DELETE FROM report_history WHERE schedule_id=? AND completed_date IS NULL AND due_date>=?',
                                      (old['id'],date.today().isoformat()))
                    else:
                        c.execute('INSERT INTO schedules(id,document_id,kind,start_date,day_of_month,repeat_rule,precision) VALUES(?,?,?,?,?,?,?)',
                                  (str(uuid.uuid4()),doc_id,kind,start,day,repeat,precision))
                c.execute('DELETE FROM document_fields WHERE document_id=?',(doc_id,))
                c.executemany('INSERT INTO document_fields(document_id,field_id) VALUES(?,?)',[(doc_id,i) for i in self.selected_field_ids])
                c.execute('DELETE FROM document_amendments WHERE document_id=?',(doc_id,))
                c.executemany('INSERT INTO document_amendments(document_id,amendment_id) VALUES(?,?)',[(doc_id,i) for i in self.amend_ids if i!=doc_id])
                ensure_periods(c)
                after_change = document_snapshot(c, doc_id)
                write_document_change(c, doc_id, 'Chỉnh sửa' if before_change else 'Thêm mới',
                                      before_change, after_change)
            self.app.refresh()
            self.destroy()
        except (ValueError,sqlite3.Error,OverflowError) as exc:
            messagebox.showerror('Không thể lưu',str(exc),parent=self)



class DocumentTable(ttk.Frame):
    """Canvas table: two-line wrapped summary, fixed proportional columns."""
    KEYS = ('number', 'issued', 'agency', 'summary', 'security_level', 'notes', 'next', 'count')
    LABELS = ('Số/Ký hiệu', 'Ngày ban hành', 'Cơ quan ký', 'Trích yếu',
              'Độ mật', 'Chú thích', 'Hạn gần nhất', 'Bộ đếm')
    WEIGHTS = (1.35, 1.05, 1.65, 4.95, 0, 1.65, 1.45, 1.35)
    AUTO_FIT_KEYS = ('number', 'issued', 'security_level', 'next', 'count')
    COLORS = {'overdue':'#ffc5c5','urgent':'#ffd6d6','orange':'#ffe3c2',
              'yellow':'#fff6c7','normal':'#dff4df','done':'#d5f0e1'}

    def __init__(self, parent):
        super().__init__(parent)
        import tkinter.font as tkfont
        self.font = tkfont.nametofont('TkDefaultFont').copy()
        self.font.configure(family='Segoe UI', size=DOC_TABLE_FONT_SIZE)
        self.bold = self.font.copy()
        self.bold.configure(weight='bold')
        self.summary_font = self.font.copy()
        self.summary_font.configure(family='Segoe UI', size=DOC_SUMMARY_FONT_SIZE)
        self.notes_font = self.font.copy()
        self.notes_font.configure(family='Segoe UI', size=DOC_NOTES_FONT_SIZE)
        self.rows = []
        self._width_cache = None
        self.selected = None
        self.sort_callbacks = {}
        self.column_widths = None
        self.manual_widths = False
        self.drag_boundary = None
        self.drag_x = None
        self.drag_initial = None
        self.header = tk.Canvas(self, height=27, highlightthickness=0, bg='#eeeeee')
        self.header.grid(row=0, column=0, sticky='ew')
        self.body = tk.Canvas(self, highlightthickness=0, bg='white')
        self.body.grid(row=1, column=0, sticky='nsew')
        self.scroll = ttk.Scrollbar(self, orient='vertical', command=self._yview)
        self.scroll.grid(row=1, column=1, sticky='ns')
        self.body.configure(yscrollcommand=self._on_yscroll)
        # Hai Canvas dùng chung thanh cuộn ngang để tiêu đề luôn thẳng cột.
        self.hscroll = ttk.Scrollbar(self, orient='horizontal', command=self._xview)
        self.hscroll.grid(row=2, column=0, sticky='ew')
        self.body.configure(xscrollcommand=self._on_xscroll)
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)
        self.body.bind('<Configure>', lambda e:self.redraw())
        self.body.bind('<Expose>', lambda e:self.redraw())
        self.header.bind('<Configure>', lambda e:self.redraw_header())
        self.header.bind('<Motion>', self.header_motion)
        self.header.bind('<Leave>', lambda e:self.header.configure(cursor=''))
        self.header.bind('<ButtonPress-1>', self.header_press)
        self.header.bind('<B1-Motion>', self.header_drag)
        self.header.bind('<ButtonRelease-1>', self.header_release)
        self.body.bind('<Button-1>', self.on_click)
        self.body.bind('<Double-1>', self.on_double_click)
        self.body.bind('<MouseWheel>', self.on_wheel)
        self.body.bind('<Button-4>', lambda e:self._yview('scroll', -1, 'units'))
        self.body.bind('<Button-5>', lambda e:self._yview('scroll', 1, 'units'))
        self._double_callback = None
        self.row_height = max(44, max(self.font.metrics('linespace'),
                                      self.summary_font.metrics('linespace'),
                                          self.notes_font.metrics('linespace')) * 2 + DOC_TABLE_ROW_PADDING)

    def _yview(self, *args):
        self.body.yview(*args)
        self.redraw()

    def _on_yscroll(self, first, last):
        self.scroll.set(first, last)

    def _xview(self, *args):
        self.body.xview(*args)
        self.header.xview(*args)

    def _on_xscroll(self, first, last):
        self.hscroll.set(first, last)
        self.header.xview_moveto(first)

    def widths(self):
        """Giữ các cột ngắn đủ chữ; Trích yếu co giãn theo cửa sổ.

        Khi cửa sổ hẹp hơn tổng chiều rộng tối thiểu, dùng cuộn ngang,
        không cắt hoặc đè chữ lên cột khác.
        """
        available = max(0, self.body.winfo_width())
        cache_key = (available, self.manual_widths, tuple(self.column_widths or ()), len(self.rows))
        if self._width_cache and self._width_cache[0] == cache_key:
            return list(self._width_cache[1])
        if available < 200: #Kích thước
            # Thứ tự:
        # Số/Ký hiệu | Ngày ban hành | Cơ quan ký | Trích yếu |
        # Độ mật | Chú thích | Hạn gần nhất | Bộ đếm
        # Trường hợp không đủ không gian hiển thị
            return [
                120,  # Số/Ký hiệu
                105,  # Ngày ban hành
                170,  # Cơ quan ký
                220,  # Trích yếu
                85,   # Độ mật
                DOC_NOTES_WIDTH,  # Chú thích
                115,  # Hạn gần nhất
                110   # Bộ đếm
            ]
        if self.manual_widths and self.column_widths is not None:
            # Khi người dùng kéo vạch cột, vẫn cho Trích yếu hấp thụ
            # phần thay đổi kích thước cửa sổ.
            widths = list(self.column_widths)
            fixed = sum(widths) - widths[3]
            widths[3] = max(DOC_SUMMARY_MIN_WIDTH, available - fixed)
            self._width_cache = (cache_key, tuple(widths))
            return widths
        #Kích thước - Chiều rộng mặc định
        # Thứ tự: Số/Ký hiệu | Ngày ban hành | Cơ quan ký | Trích yếu |
        # # Độ mật | Chú thích | Hạn gần nhất | Bộ đếm
        widths = [
            100,  # Số/Ký hiệu
            95,   # Ngày ban hành
            170,  # Cơ quan ký
            DOC_SUMMARY_MIN_WIDTH,  # Trích yếu
            85,   # Độ mật
            DOC_NOTES_WIDTH,  # Chú thích
            110,  # Hạn gần nhất
            110   # Bộ đếm
            ]
        for i, (key, title) in enumerate(zip(self.KEYS, self.LABELS)):
            if key not in self.AUTO_FIT_KEYS:
                continue
            width = self.bold.measure(title) + 20
            for row in self.rows:
                value = ' '.join(str(row['values'][i] or '').split())
                width = max(width, self.font.measure(value) + 18)
            widths[i] = width
        # Trích yếu nhận đúng phần chiều ngang còn lại. Các cột khác
        # không bị co nhỏ đến mức mất chữ.
        widths[3] = max(DOC_SUMMARY_MIN_WIDTH, available - (sum(widths) - widths[3]))
        self._width_cache = (cache_key, tuple(widths))
        return widths

    def boundary_at(self, x):
        pos = 0
        x = self.header.canvasx(x)
        widths = self.widths()
        for i, width in enumerate(widths[:-1]):
            pos += width
            if abs(x - pos) <= 6:
                return i
        return None

    def header_motion(self, event):
        self.header.configure(cursor='sb_h_double_arrow' if self.boundary_at(event.x) is not None else '')

    def header_press(self, event):
        self.drag_boundary = self.boundary_at(event.x)
        if self.drag_boundary is not None:
            self.drag_x = self.header.canvasx(event.x)
            self.drag_initial = self.widths()

    def header_drag(self, event):
        if self.drag_boundary is None:
            return
        i = self.drag_boundary
        left, right = self.drag_initial[i], self.drag_initial[i+1]
        delta = max(65-left, min(self.header.canvasx(event.x)-self.drag_x, right-65))
        widths = list(self.drag_initial)
        widths[i], widths[i+1] = left+delta, right-delta
        self.column_widths = widths
        self._width_cache = None
        self.manual_widths = True
        self.redraw()

    def header_release(self, event):
        if self.drag_boundary is None:
            self.header_click(event)
        self.drag_boundary = None
        self.drag_initial = None
        self.drag_x = None

    def redraw_header(self):
        self.header.delete('all')
        self.header.configure(scrollregion=(0, 0, sum(self.widths()), 27))
        x=0
        for key,label,w in zip(self.KEYS,self.LABELS,self.widths()):
            self.header.create_rectangle(x,0,x+w,27,fill='#eeeeee',outline='#d1d1d1')
            self.header.create_text(x+w/2,13,text=label,font=self.bold,anchor='center')
            x+=w

    def header_click(self,event):
        x=self.header.canvasx(event.x)
        for key,w in zip(self.KEYS,self.widths()):
            if x < w:
                callback=self.sort_callbacks.get(key)
                if callback:callback()
                return
            x-=w

    def _fit(self,text,max_width,max_lines=1,font=None):
        font = font or self.font
        text=' '.join(str(text or '').split())
        if max_width <= 10:return ''
        words=text.split(' ')
        lines=[]
        line=''
        for word in words:
            candidate=(line+' '+word).strip()
            if font.measure(candidate)<=max_width:
                line=candidate
                continue
            if line:
                lines.append(line)
                line=''
            # Handle a single unbroken long word.
            while font.measure(word)>max_width:
                cut=len(word)
                while cut>1 and font.measure(word[:cut])>max_width:cut-=1
                lines.append(word[:cut])
                word=word[cut:]
            line=word
        if line:lines.append(line)
        if len(lines)>max_lines:
            lines=lines[:max_lines]
            last=lines[-1]
            while last and font.measure(last+'…')>max_width:last=last[:-1]
            lines[-1]=last.rstrip()+'…'
        return '\n'.join(lines)

    def redraw(self):
        if not self.body.winfo_exists():return
        self.redraw_header()
        self.body.delete('all')
        widths=self.widths()
        total_width = sum(widths)
        self.header.configure(scrollregion=(0, 0, total_width, 27))
        total_height = len(self.rows) * self.row_height
        self.body.configure(scrollregion=(0, 0, total_width, total_height))
        top = max(0, int(self.body.canvasy(0) // self.row_height) - 1)
        bottom = min(len(self.rows), int(self.body.canvasy(self.body.winfo_height()) // self.row_height) + 2)
        for idx in range(top, bottom):
            row = self.rows[idx]
            y=idx*self.row_height
            bg = '#1675c5' if row['iid']==self.selected else self.COLORS.get(row['tag'],'white')
            fg = 'white' if row['iid']==self.selected else 'black'
            self.body.create_rectangle(0,y,sum(widths),y+self.row_height,fill=bg,outline='#e5e5e5')
            x=0
            for key,value,w in zip(self.KEYS,row['values'],widths):
                line_count = 2 if key in ('summary', 'notes') else 1
                cell_font = (self.summary_font if key == 'summary' else
                             self.notes_font if key == 'notes' else self.font)
                content=self._fit(value,w-12,line_count,font=cell_font)
                self.body.create_text(x+6,y+5,text=content,fill=fg,font=cell_font,
                                      anchor='nw',justify='left')
                x+=w
        self.body.configure(scrollregion=(0,0,sum(widths),len(self.rows)*self.row_height))

    def on_click(self,event):
        idx=int(self.body.canvasy(event.y)//self.row_height)
        if 0<=idx<len(self.rows):
            self.selected=self.rows[idx]['iid']
            self.redraw()

    def on_double_click(self,event):
        self.on_click(event)
        if self._double_callback:self._double_callback(event)

    def on_wheel(self,event):
        self.body.yview_scroll(-int(event.delta/120),'units')
        self.redraw()

    def bind(self,sequence,callback,add=None):
        if sequence=='<Double-1>':self._double_callback=callback
        else:return super().bind(sequence,callback,add)

    def insert(self,parent,index,iid=None,values=(),tags=()):
        self.rows.append({'iid':iid,'values':tuple(values),'tag':tags[0] if tags else ''})
        self._width_cache = None
        if not self.manual_widths: self.column_widths = None
        return iid

    def get_children(self,item=''):
        return tuple(row['iid'] for row in self.rows)

    def delete(self,*iids):
        ids=set(iids)
        self.rows=[r for r in self.rows if r['iid'] not in ids]
        self._width_cache = None
        if not self.manual_widths: self.column_widths = None
        if self.selected in ids:self.selected=None
        self.redraw()

    def selection(self):
        return (self.selected,) if self.selected else ()

    def set(self,iid,column):
        idx=self.KEYS.index(column)
        return next((r['values'][idx] for r in self.rows if r['iid']==iid),'')

    def move(self,iid,parent,index):
        for i,r in enumerate(self.rows):
            if r['iid']==iid:
                self.rows.insert(index,self.rows.pop(i))
                break
        self.redraw()

    def heading(self,key,text=None,command=None):
        if command is not None:self.sort_callbacks[key]=command



# Chiều cao mỗi ô ngày (pixel), không giãn theo cửa sổ.
CALENDAR_DAY_HEIGHT = 30
CALENDAR_WEEKDAY_HEIGHT = 27
CALENDAR_DAY_FONT_SIZE = 10
CALENDAR_COUNT_FONT_SIZE = 9


class ReportCalendar(ttk.Frame):
    """Lịch tháng dùng dữ liệu kỳ báo cáo hiện có, không tạo bảng mới."""
    def __init__(self, parent, app):
        super().__init__(parent, padding=8)
        self.app = app
        today = date.today()
        self.year, self.month = today.year, today.month
        self.selected_date = today
        self.reports = []
        self.by_day = {}
        self.undated = []
        self.month_title = tk.StringVar()
        self.day_title = tk.StringVar()

        bar = ttk.Frame(self)
        bar.pack(fill='x', pady=(0, 7))
        ttk.Button(bar, text='◀ Tháng trước', command=lambda: self.change_month(-1)).pack(side='left')
        ttk.Label(bar, textvariable=self.month_title, font=('Segoe UI', 15, 'bold'), anchor='center').pack(side='left', expand=True)
        ttk.Button(bar, text='Hôm nay', command=self.go_today).pack(side='right', padx=(6, 0))
        ttk.Button(bar, text='Tháng sau ▶', command=lambda: self.change_month(1)).pack(side='right')

        self.calendar_frame = tk.Frame(self, bg='#DCE5F0')
        self.calendar_frame.pack(fill='x', expand=False)
        self.calendar_frame.grid_propagate(False)
        for col in range(7):
            self.calendar_frame.columnconfigure(col, weight=1, uniform='calendar')
        self.calendar_frame.rowconfigure(0, minsize=CALENDAR_WEEKDAY_HEIGHT, weight=0)
        for row in range(1, 7):
            self.calendar_frame.rowconfigure(row, minsize=CALENDAR_DAY_HEIGHT, weight=0)
        for col, name in enumerate(('T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN')):
            tk.Label(self.calendar_frame, text=name, bg='#DCE8F8', fg='#1C3858',
                     font=('Segoe UI', 10, 'bold'), pady=4).grid(row=0, column=col, sticky='nsew', padx=1, pady=1)

        legend = ttk.Frame(self)
        legend.pack(fill='x', pady=(6, 3))
        for text, color in (('Quá hạn', '#B42318'), ('Đến hạn ≤7 ngày', '#B54708'),
                            ('Đến hạn 8–30 ngày', '#8B6914'), ('Hoàn thành', '#147D47')):
            tk.Label(legend, text='● ' + text, fg=color, font=('Segoe UI', 9)).pack(side='left', padx=(0, 16))

        detail_bar = ttk.Frame(self)
        detail_bar.pack(fill='x', pady=(4, 3))
        ttk.Label(detail_bar, textvariable=self.day_title, font=('Segoe UI', 11, 'bold')).pack(side='left')
        ttk.Button(detail_bar, text='Mở văn bản', command=self.open_document).pack(side='right', padx=(6, 0))
        ttk.Button(detail_bar, text='Hoàn thành / Hoàn tác', command=self.toggle_selected).pack(side='right')

        table_frame = ttk.Frame(self)
        table_frame.pack(fill='both', expand=True)
        cols = ('number', 'summary', 'kind', 'due', 'count', 'status')
        self.tree = ttk.Treeview(table_frame, columns=cols, show='headings', height=6, selectmode='browse')
        for col, label, width in zip(cols,
                ('Số/Ký hiệu', 'Trích yếu', 'Loại báo cáo', 'Thời hạn', 'Bộ đếm', 'Trạng thái'),
                (155, 370, 110, 110, 145, 115)):
            self.tree.heading(col, text=label)
            self.tree.column(col, width=width, minwidth=75, stretch=(col == 'summary'))
        for tag, color in DocumentTable.COLORS.items():
            self.tree.tag_configure(tag, background=color)
        yscroll = ttk.Scrollbar(table_frame, orient='vertical', command=self.tree.yview)
        xscroll = ttk.Scrollbar(table_frame, orient='horizontal', command=self.tree.xview)
        self.tree.configure(yscrollcommand=yscroll.set, xscrollcommand=xscroll.set)
        self.tree.grid(row=0, column=0, sticky='nsew')
        yscroll.grid(row=0, column=1, sticky='ns')
        xscroll.grid(row=1, column=0, sticky='ew')
        table_frame.columnconfigure(0, weight=1)
        table_frame.rowconfigure(0, weight=1)
        self.tree.bind('<Double-1>', lambda _: self.open_document())

        self.undated_label = tk.StringVar()
        ttk.Label(self, textvariable=self.undated_label, foreground='#58677A').pack(fill='x', pady=(3, 0))

    def set_reports(self, reports):
        self.reports = list(reports)
        self.render()

    def change_month(self, offset):
        index = self.year * 12 + self.month - 1 + offset
        self.year, month0 = divmod(index, 12)
        self.month = month0 + 1
        self.selected_date = date(self.year, self.month, 1)
        self.render()

    def go_today(self):
        self.selected_date = date.today()
        self.year, self.month = self.selected_date.year, self.selected_date.month
        self.render()

    def select_day(self, day):
        self.selected_date = day
        self.render()

    def render(self):
        self.month_title.set(f'THÁNG {self.month:02d}/{self.year}')
        self.by_day = {}
        self.undated = []
        for report in self.reports:
            if report['precision'] != 'day':
                start = report['schedule_start'] or ''
                if ((report['precision'] == 'month' and start[:7] == f'{self.year:04d}-{self.month:02d}')
                        or (report['precision'] == 'year' and start[:4] == str(self.year))):
                    self.undated.append(report)
                continue
            due = date.fromisoformat(report['due_date'])
            if due.year == self.year and due.month == self.month:
                self.by_day.setdefault(due.day, []).append(report)
        for widget in self.calendar_frame.grid_slaves():
            if int(widget.grid_info()['row']) > 0:
                widget.destroy()
        weeks = calendar.Calendar(firstweekday=0).monthdatescalendar(self.year, self.month)
        # 4, 5 hoặc 6 tuần: khung lịch cao vừa đủ; phần còn lại dành cho bảng.
        self.calendar_frame.configure(height=CALENDAR_WEEKDAY_HEIGHT + len(weeks) * CALENDAR_DAY_HEIGHT + 2 * (len(weeks) + 1))
        for row in range(1, 7):
            self.calendar_frame.rowconfigure(row, minsize=CALENDAR_DAY_HEIGHT if row <= len(weeks) else 0)
        today = date.today()
        for week_index, week in enumerate(weeks, start=1):
            for col, day in enumerate(week):
                in_month = day.month == self.month
                records = self.by_day.get(day.day, []) if in_month else []
                pending = [r for r in records if not r['completed_date']]
                completed = len(records) - len(pending)
                overdue = sum(day < today for _ in pending)
                urgent = sum(0 <= (day - today).days <= 7 for _ in pending)
                soon = sum(7 < (day - today).days <= 30 for _ in pending)
                if overdue: bg, accent = '#FFF0F0', '#B42318'
                elif urgent: bg, accent = '#FFF0E7', '#B54708'
                elif soon: bg, accent = '#FFF9E6', '#8B6914'
                elif pending: bg, accent = '#EDF5FF', '#235D9F'
                elif completed: bg, accent = '#E8F8ED', '#147D47'
                else: bg, accent = ('#FFFFFF', '#334155') if in_month else ('#F0F2F5', '#A5AEB8')
                selected = day == self.selected_date
                cell = tk.Frame(self.calendar_frame, bg=bg,
                                highlightthickness=2 if selected else 0,
                                highlightbackground='#2377C4')
                cell.grid(row=week_index, column=col, sticky='nsew', padx=1, pady=1)
                # Một hàng ngang: ngày bên trái, số báo cáo bên phải.
                # Không thêm dòng phụ nên chiều cao luôn cố định.
                tk.Label(cell, text=str(day.day), bg=bg, fg=accent,
                         font=('Segoe UI', CALENDAR_DAY_FONT_SIZE,
                               'bold' if selected or records else 'normal')).pack(
                             side='left', padx=(6, 2), anchor='center')
                if records:
                    tk.Label(cell, text=f'{len(records)} báo cáo', bg=bg, fg=accent,
                             font=('Segoe UI', CALENDAR_COUNT_FONT_SIZE, 'bold')).pack(
                                 side='right', padx=(2, 6), anchor='center')
                if in_month:
                    for target in (cell, *cell.winfo_children()):
                        target.bind('<Button-1>', lambda _e, d=day: self.select_day(d))
                        target.configure(cursor='hand2')
        self.undated_label.set(
            f'Có {len(self.undated)} kỳ báo cáo chỉ xác định tháng/năm (không gán ngày cụ thể).'
            if self.undated else '')
        self.refresh_details()

    def refresh_details(self):
        day = self.selected_date
        records = self.by_day.get(day.day, []) if day.year == self.year and day.month == self.month else []
        self.day_title.set(f'BÁO CÁO NGÀY {day:%d/%m/%Y} — {len(records)} kỳ')
        self.tree.delete(*self.tree.get_children())
        for r in records:
            due, (count, tag) = report_display(r)
            self.tree.insert('', 'end', iid=r['id'],
                             values=(f"{r['number']}/{r['symbol']}", r['summary'],
                                     r['kind'], due, count,
                                     'Hoàn thành' if r['completed_date'] else 'Chưa xong'),
                             tags=(tag,))

    def selected_report_id(self):
        selection = self.tree.selection()
        return selection[0] if selection else None

    def open_document(self):
        report_id = self.selected_report_id()
        if not report_id:
            messagebox.showinfo('Lịch báo cáo', 'Hãy chọn một kỳ báo cáo trong danh sách.', parent=self)
            return
        with db_session() as c:
            row = c.execute("SELECT s.document_id FROM report_history h "
                            "JOIN schedules s ON s.id=h.schedule_id WHERE h.id=?", (report_id,)).fetchone()
        if row:
            Editor(self.app, row['document_id'])

    def toggle_selected(self):
        report_id = self.selected_report_id()
        if not report_id:
            messagebox.showinfo('Lịch báo cáo', 'Hãy chọn một kỳ báo cáo trong danh sách.', parent=self)
            return
        self.app.toggle_report_id(report_id)



def dashboard_statistics(reports, document_count):
    """Thống kê toàn bộ dữ liệu; chỉ kỳ có ngày chính xác mới tính hạn."""
    today = date.today()
    completed = sum(bool(r['completed_date']) for r in reports)
    overdue = []
    upcoming = []
    undated = 0
    for r in reports:
        if r['precision'] != 'day':
            undated += 1
            continue
        if r['completed_date']:
            continue
        delta = (date.fromisoformat(r['due_date']) - today).days
        if delta < 0:
            overdue.append(r)
        elif delta <= DASHBOARD_UPCOMING_DAYS:
            upcoming.append(r)
    return dict(documents=document_count, total=len(reports), completed=completed,
                pending=len(reports)-completed, overdue=len(overdue),
                upcoming=len(upcoming), undated=undated,
                rate=(100 * completed / len(reports)) if reports else 0,
                priority=sorted(overdue + upcoming,
                                key=lambda r: (r['due_date'], r['number'])))


def dashboard_period_match(report, mode, year, month, quarter):
    """Lọc theo kỳ hạn; kỳ chỉ có tháng/năm giữ đúng độ chính xác."""
    if mode == 'Toàn bộ':
        return True
    raw = str(report['due_date'] or '')
    if not raw or int(raw[:4]) != year:
        return False
    if mode == 'Năm':
        return True
    # due_date của kỳ tháng/năm có thể được lưu dạng ngày dự kiến;
    # chỉ lấy tháng, không suy diễn hạn ngày.
    due_month = int(raw[5:7]) if len(raw) >= 7 else None
    if mode == 'Tháng':
        return due_month == month
    if mode == 'Quý':
        return due_month is not None and (due_month - 1) // 3 + 1 == quarter
    return True


class Dashboard(ttk.Frame):
    """Trang tổng quan độc lập; không thay đổi SQLite."""
    def __init__(self, parent, app):
        super().__init__(parent, padding=10)
        self.app = app
        self.report_lookup = {}
        self.stat = {}
        top = ttk.Frame(self)
        top.pack(fill='x', pady=(0, 9))
        ttk.Label(top, text='TỔNG QUAN CÔNG VIỆC',
                  font=('Segoe UI', DASHBOARD_TITLE_FONT_SIZE, 'bold')).pack(side='left')
        ttk.Button(top, text='Làm mới', command=app.refresh).pack(side='right')
        # Bộ lọc độc lập của Dashboard, không tác động tìm kiếm ở các tab khác.
        filters = ttk.Frame(self)
        filters.pack(fill='x', pady=(0, 9))
        now = date.today()
        self.period_mode = tk.StringVar(value='Toàn bộ')
        self.period_year = tk.StringVar(value=str(now.year))
        self.period_month = tk.StringVar(value=str(now.month))
        self.period_quarter = tk.StringVar(value=str((now.month - 1) // 3 + 1))
        ttk.Label(filters, text='Thống kê theo:').pack(side='left', padx=(0, 6))
        # Giữ giá trị đã chọn để khôi phục khi chuyển qua lại Tháng/Quý/Năm.
        self._saved_month = self.period_month.get()
        self._saved_quarter = self.period_quarter.get()
        self.period_widgets = {}
        for key, var, options, width in (
            ('mode', self.period_mode, ('Toàn bộ', 'Tháng', 'Quý', 'Năm'), 11),
            ('month', self.period_month, tuple(str(x) for x in range(1, 13)), 5),
            ('quarter', self.period_quarter, ('1', '2', '3', '4'), 5),
            ('year', self.period_year, tuple(str(x) for x in range(now.year - 10, now.year + 11)), 8),
        ):
            widget = ttk.Combobox(filters, textvariable=var, values=options,
                                  width=width, state='readonly')
            widget.pack(side='left', padx=(0, 8))
            self.period_widgets[key] = widget
            widget.bind('<<ComboboxSelected>>',
                        self.on_period_mode_change if key == 'mode'
                        else lambda _e: self.render_data())
        self.update_period_controls()
        ttk.Button(filters, text='Xóa lọc', command=self.reset_period).pack(side='left')
        self.scope_text = tk.StringVar(value='Thống kê toàn bộ dữ liệu')
        ttk.Label(filters, textvariable=self.scope_text, foreground='#536477').pack(side='right')
        self.all_reports = []
        self.all_documents = []
        self.cards = ttk.Frame(self)
        self.cards.pack(fill='x', pady=(0, 10))
        for col in range(4):
            self.cards.columnconfigure(col, weight=1, uniform='cards')
        specs = [
            ('documents', 'TỔNG VĂN BẢN', '#EDF5FF', '#235D9F'),
            ('pending', 'CHƯA HOÀN THÀNH', '#FFF9E6', '#8B6914'),
            ('overdue', 'QUÁ HẠN', '#FFF0F0', '#B42318'),
            ('completed', 'ĐÃ HOÀN THÀNH', '#E8F8ED', '#147D47'),
        ]
        self.card_values = {}
        for i, (key, label, bg, fg) in enumerate(specs):
            card = tk.Frame(self.cards, bg=bg, padx=12, pady=10,
                            highlightbackground='#DEE5EF', highlightthickness=1,
                            cursor='hand2')
            card.grid(row=0, column=i, sticky='nsew', padx=(0 if i == 0 else 5, 0))
            title = tk.Label(card, text=label, bg=bg, fg=fg, anchor='w',
                             font=('Segoe UI', DASHBOARD_CARD_LABEL_FONT_SIZE, 'bold'))
            title.pack(fill='x')
            value = tk.Label(card, text='0', bg=bg, fg=fg, anchor='w',
                             font=('Segoe UI', DASHBOARD_CARD_NUMBER_FONT_SIZE, 'bold'))
            value.pack(fill='x')
            self.card_values[key] = value
            for widget in (card, title, value):
                widget.bind('<Button-1>', lambda _event, k=key: self.open_card(k))
        line = ttk.Frame(self)
        line.pack(fill='x', pady=(0, 10))
        self.progress_text = tk.StringVar(value='Tiến độ hoàn thành: 0%')
        ttk.Label(line, textvariable=self.progress_text,
                  font=('Segoe UI', 11, 'bold')).pack(anchor='w')
        self.progress = ttk.Progressbar(line, maximum=100, mode='determinate')
        self.progress.pack(fill='x', pady=(5, 5))
        self.secondary_text = tk.StringVar()
        ttk.Label(line, textvariable=self.secondary_text,
                  foreground='#536477').pack(anchor='w')
        titlebar = ttk.Frame(self)
        titlebar.pack(fill='x', pady=(0, 4))
        ttk.Label(titlebar, text=f'CÔNG VIỆC CẦN ƯU TIÊN (QUÁ HẠN / TRONG {DASHBOARD_UPCOMING_DAYS} NGÀY)',
                  font=('Segoe UI', 12, 'bold'),
                    foreground='#CC0000'  # Màu chữ đỏ
                    ).pack(side='left')
        ttk.Button(titlebar, text='Mở văn bản', command=self.open_document).pack(side='right')
        table_frame = ttk.Frame(self)
        table_frame.pack(fill='both', expand=True)
        columns = ('number', 'summary', 'kind', 'due', 'count')
        self.tree = ttk.Treeview(table_frame, columns=columns, show='headings',
                                 selectmode='browse', style='Dashboard.Treeview')
        ttk.Style(self).configure('Dashboard.Treeview',
                        font=('Segoe UI', 10),
                        rowheight=DASHBOARD_TABLE_ROW_HEIGHT)

        ttk.Style(self).configure('Dashboard.Treeview.Heading',
                        font=('Segoe UI', 10, 'bold'))
        #ttk.Style(self).configure('Dashboard.Treeview', rowheight=DASHBOARD_TABLE_ROW_HEIGHT)

        for key, label, width in zip(columns,
                                     ('Số/Ký hiệu', 'Trích yếu', 'Loại báo cáo', 'Thời hạn', 'Bộ đếm'),
                                     (165, 430, 120, 125, 160)):
            self.tree.heading(key, text=label)
            self.tree.column(key, width=width, minwidth=90, stretch=(key == 'summary'))
        for key, bg in DocumentTable.COLORS.items():
            self.tree.tag_configure(key, background=bg)
        ys = ttk.Scrollbar(table_frame, orient='vertical', command=self.tree.yview)
        xs = ttk.Scrollbar(table_frame, orient='horizontal', command=self.tree.xview)
        self.tree.configure(yscrollcommand=ys.set, xscrollcommand=xs.set)
        self.tree.grid(row=0, column=0, sticky='nsew')
        ys.grid(row=0, column=1, sticky='ns')
        xs.grid(row=1, column=0, sticky='ew')
        table_frame.rowconfigure(0, weight=1)
        table_frame.columnconfigure(0, weight=1)
        self.tree.bind('<Double-1>', lambda _event: self.open_document())

    def update_period_controls(self):
        """Ô không sử dụng hiển thị '-' và khóa chọn; giữ giá trị lọc cũ."""
        mode = self.period_mode.get()
        for key, active_mode, var, saved_attr in (
            ('month', 'Tháng', self.period_month, '_saved_month'),
            ('quarter', 'Quý', self.period_quarter, '_saved_quarter'),
        ):
            widget = self.period_widgets[key]
            if mode == active_mode:
                var.set(getattr(self, saved_attr))
                widget.configure(state='readonly')
            else:
                if var.get() != '-':
                    setattr(self, saved_attr, var.get())
                var.set('-')
                widget.configure(state='disabled')

    def on_period_mode_change(self, _event=None):
        self.update_period_controls()
        self.render_data()

    def reset_period(self):
        self.period_mode.set('Toàn bộ')
        self.update_period_controls()
        self.render_data()

    def set_data(self, reports, documents):
        self.all_reports = list(reports)
        self.all_documents = list(documents)
        self.render_data()

    def render_data(self):
        mode = self.period_mode.get()
        year = int(self.period_year.get())
        month = int(self.period_month.get()) if mode == 'Tháng' else int(self._saved_month)
        quarter = int(self.period_quarter.get()) if mode == 'Quý' else int(self._saved_quarter)
        if mode == 'Tháng':
            self._saved_month = str(month)
        elif mode == 'Quý':
            self._saved_quarter = str(quarter)
        reports = [r for r in self.all_reports
                   if dashboard_period_match(r, mode, year, month, quarter)]
        self.report_lookup = {r['id']: r for r in reports}
        self.stat = dashboard_statistics(reports, len(self.all_documents))
        for key, label in self.card_values.items():
            label.configure(text=str(self.stat[key]))
        self.progress['value'] = self.stat['rate']
        self.progress_text.set(f"Tiến độ hoàn thành: {self.stat['rate']:.1f}% "
                               f"({self.stat['completed']}/{self.stat['total']} kỳ)")
        self.secondary_text.set(
            f"Đến hạn trong {DASHBOARD_UPCOMING_DAYS} ngày: {self.stat['upcoming']} kỳ  |  "
            f"Chỉ xác định tháng/năm: {self.stat['undated']} kỳ")
        scope = {'Toàn bộ': 'Tất cả kỳ báo cáo', 'Tháng': f'Tháng {month:02d}/{year}',
                 'Quý': f'Quý {quarter}/{year}', 'Năm': f'Năm {year}'}
        self.scope_text.set(scope[mode] + ' · Văn bản: toàn bộ Data')
        self.tree.delete(*self.tree.get_children())
        for r in self.stat['priority']:
            due, (count, tag) = report_display(r)
            self.tree.insert('', 'end', iid=r['id'],
                             values=(f"{r['number']}/{r['symbol']}", r['summary'],
                                     r['kind'], due, count), tags=(tag,))

    def selected_report_id(self):
        selected = self.tree.selection()
        return selected[0] if selected else None

    def selected_document_id(self):
        r = self.report_lookup.get(self.selected_report_id())
        return r['document_id'] if r else None

    def open_document(self):
        doc_id = self.selected_document_id()
        if doc_id:
            Editor(self.app, doc_id)
        else:
            messagebox.showinfo('Tổng quan', 'Hãy chọn một kỳ báo cáo trong danh sách.', parent=self)

    def open_card(self, key):
        if key == 'documents':
            self.app.tabs.select(self.app.doc_frame)
            return
        if key in ('pending', 'overdue', 'completed'):
            # Lọc danh sách bằng đúng tập ID của phạm vi Dashboard đang xem.
            ids = set(self.report_lookup)
            if key == 'pending':
                ids = {i for i in ids if not self.report_lookup[i]['completed_date']}
            elif key == 'completed':
                ids = {i for i in ids if self.report_lookup[i]['completed_date']}
            else:
                today = date.today().isoformat()
                ids = {i for i in ids if not self.report_lookup[i]['completed_date']
                       and self.report_lookup[i]['precision'] == 'day'
                       and self.report_lookup[i]['due_date'] < today}
            self.app.set_report_filter(ids, key)


class ReportResultEditor(tk.Toplevel):
    """Sua ket qua cho dung mot ky bao cao; khong sua lich bao cao goc."""
    def __init__(self, app, report_id):
        super().__init__(app)
        self.app, self.report_id = app, report_id
        with db_session() as c:
            row = c.execute("""SELECT h.*, s.kind, d.number, d.symbol
                FROM report_history h JOIN schedules s ON s.id=h.schedule_id
                JOIN documents d ON d.id=s.document_id WHERE h.id=?""", (report_id,)).fetchone()
        if row is None:
            self.destroy()
            messagebox.showerror('Kết quả báo cáo', 'Không tìm thấy kỳ báo cáo.', parent=app)
            return
        self.title('K02 - KẾT QUẢ BÁO CÁO')
        self.geometry(f'{RESULT_EDITOR_WIDTH}x{RESULT_EDITOR_HEIGHT}')
        self.minsize(550, 450)
        self.transient(app)
        self.configure(bg='#F3F6FB')
        body = ttk.Frame(self, padding=14)
        body.pack(fill='both', expand=True)
        body.columnconfigure(1, weight=1)
        ttk.Label(body, text=f"{row['number']}/{row['symbol']}  •  {row['kind']}",
                  font=('Segoe UI', 12, 'bold')).grid(row=0, column=0, columnspan=3, sticky='w', pady=(0,12))
        ttk.Label(body, text='Ngày hoàn thành (dd/mm/yyyy):').grid(row=1,column=0,sticky='w',pady=5)
        self.completed = tk.StringVar(value=display_date(row['completed_date']) if row['completed_date'] else date.today().strftime('%d/%m/%Y'))
        ttk.Entry(body, textvariable=self.completed).grid(row=1,column=1,columnspan=2,sticky='ew',pady=5)
        ttk.Label(body, text='Số/ký hiệu báo cáo kết quả:').grid(row=2,column=0,sticky='w',pady=5)
        self.symbol = tk.StringVar(value=row['result_symbol'] or '')
        ttk.Entry(body, textvariable=self.symbol).grid(row=2,column=1,columnspan=2,sticky='ew',pady=5)
        ttk.Label(body, text='File báo cáo kết quả:').grid(row=3,column=0,sticky='w',pady=5)
        self.attachment = tk.StringVar(value=row['result_attachment'] or '')
        ttk.Entry(body, textvariable=self.attachment).grid(row=3,column=1,sticky='ew',pady=5)
        tk.Button(body,text='Chọn file',command=self.choose_file,bg='#98C6F1',relief='flat',padx=10).grid(row=3,column=2,padx=(7,0))
        result_file_tools = ttk.Frame(body)
        result_file_tools.grid(row=4, column=0, columnspan=3, sticky='w', pady=(2, 6))
        for label, action in [('Mở file', 'open'), ('Mở thư mục', 'folder'),
                              ('Kiểm tra', 'check')]:
            ttk.Button(result_file_tools, text=label,
                command=lambda a=action: linked_file_action(self.attachment.get(), self, a)).pack(
                    side='left', padx=(0, 5))
        ttk.Button(result_file_tools, text='Cập nhật đường dẫn',
                   command=self.choose_file).pack(side='left')

        ttk.Label(body, text='Ghi chú kết quả:').grid(row=5,column=0,columnspan=3,sticky='w',pady=(10,4))
        self.notes = tk.Text(body,height=RESULT_NOTES_LINES,wrap='word',font=('Segoe UI',10))
        self.notes.grid(row=6,column=0,columnspan=3,sticky='nsew')
        self.notes.insert('1.0', row['result_notes'] or '')
        body.rowconfigure(6,weight=1)
        ttk.Label(body,text='Lịch sử cập nhật (mới nhất trước):').grid(row=7,column=0,columnspan=3,sticky='w',pady=(12,4))
        self.history = tk.Listbox(body,height=5,font=('Segoe UI',9))
        self.history.grid(row=8,column=0,columnspan=3,sticky='nsew')
        body.rowconfigure(8,weight=1)
        self.load_history()
        footer=ttk.Frame(body)
        footer.grid(row=9,column=0,columnspan=3,sticky='e',pady=(12,0))
        tk.Button(footer,text='Lưu kết quả',command=self.save,bg='#A2F0B5',font=('Segoe UI',10,'bold'),relief='flat',padx=12,pady=6).pack(side='left',padx=4)
        tk.Button(footer,text='Hoàn tác',command=self.undo,bg='#FFE597',font=('Segoe UI',10,'bold'),relief='flat',padx=12,pady=6).pack(side='left',padx=4)
        tk.Button(footer,text='Đóng',command=self.destroy,bg='#FA9E9E',font=('Segoe UI',10,'bold'),relief='flat',padx=12,pady=6).pack(side='left',padx=4)
        self.grab_set()

    def choose_file(self):
        path=filedialog.askopenfilename(parent=self,title='Chọn file báo cáo kết quả')
        if path:
            self.attachment.set(path)

    def load_history(self):
        self.history.delete(0,'end')
        with db_session() as c:
            rows=c.execute('SELECT * FROM result_audit WHERE report_id=? ORDER BY changed_at DESC, rowid DESC LIMIT 100',(self.report_id,)).fetchall()
        for r in rows:
            self.history.insert('end',f"{r['changed_at'][:19]} | {r['action']} | {r['completed_date'] or 'Chưa hoàn thành'} | {r['result_symbol'] or ''}")

    def save(self):
        try:
            completed=parse_date(self.completed.get()).isoformat()
        except (ValueError, TypeError):
            messagebox.showwarning('Ngày không hợp lệ','Nhập ngày hoàn thành theo dd/mm/yyyy.',parent=self)
            return
        symbol=self.symbol.get().strip()
        attachment=self.attachment.get().strip()
        notes=self.notes.get('1.0','end-1c').strip()
        now=datetime.now().isoformat(timespec='seconds')
        with db_session() as c:
            c.execute("""UPDATE report_history SET completed_date=?,result_symbol=?,
                result_attachment=?,result_notes=?,result_updated=? WHERE id=?""",
                (completed,symbol,attachment,notes,now,self.report_id))
            c.execute("""INSERT INTO result_audit
                (id,report_id,action,changed_at,completed_date,result_symbol,result_attachment,result_notes)
                VALUES (?,?,?,?,?,?,?,?)""",
                (str(uuid.uuid4()),self.report_id,'Lưu kết quả',now,completed,symbol,attachment,notes))
        self.app.refresh()
        self.load_history()
        messagebox.showinfo('Kết quả báo cáo','Đã lưu kết quả cho kỳ báo cáo được chọn.',parent=self)

    def undo(self):
        if not messagebox.askyesno('Xác nhận hoàn tác',
                'Chuyển kỳ này về chưa hoàn thành? Thông tin kết quả vẫn được giữ để tra cứu.',parent=self):
            return
        now=datetime.now().isoformat(timespec='seconds')
        with db_session() as c:
            row=c.execute('SELECT result_symbol,result_attachment,result_notes FROM report_history WHERE id=?',(self.report_id,)).fetchone()
            if row is None:return
            c.execute('UPDATE report_history SET completed_date=NULL,result_updated=? WHERE id=?',(now,self.report_id))
            c.execute("""INSERT INTO result_audit
                (id,report_id,action,changed_at,completed_date,result_symbol,result_attachment,result_notes)
                VALUES (?,?,?,?,?,?,?,?)""",
                (str(uuid.uuid4()),self.report_id,'Hoàn tác',now,None,row['result_symbol'],row['result_attachment'],row['result_notes']))
        self.app.refresh()
        self.destroy()


class DocumentStatistics(ttk.Frame):
    """Tab 3.5: thẻ thống kê tương tác và danh sách chi tiết 3 dòng."""
    def __init__(self,parent,app):
        super().__init__(parent,padding=10)
        self.app=app
        self.status=tk.StringVar(value='Tất cả')
        self.kind=tk.StringVar(value='Tất cả')
        self.order=tk.StringVar(value='Cũ nhất trước')
        self.query=tk.StringVar()
        self.status_cards={}
        self._search_after_id = None
        self._batch_filters = False
        header=ttk.Frame(self);header.pack(fill='x',pady=(0,8))
        ttk.Label(header,text='THỐNG KÊ VĂN BẢN',font=('Segoe UI',15,'bold')).pack(anchor='w')
        cards=ttk.Frame(self);cards.pack(fill='x',pady=5)
        for i,(key,color) in enumerate((('Tất cả','#DDEBFA'),('Còn hiệu lực','#CBF1D5'),('Hết hiệu lực','#F8D1D1'),('Cần rà soát','#FFF0C0'))):
            cards.columnconfigure(i,weight=1)
            btn=tk.Button(cards,text='',font=('Segoe UI',11,'bold'),bg=color,relief='ridge',bd=2,
                          command=lambda k=key:self.choose_status(k),height=3,wraplength=160)
            btn.grid(row=0,column=i,sticky='ew',padx=4)
            self.status_cards[key]=btn
        bar=ttk.Frame(self);bar.pack(fill='x',pady=(12,6))
        ttk.Label(bar,text='Bộ lọc nhanh:',font=('Segoe UI',10,'bold')).pack(side='left',padx=(0,8))
        ttk.Entry(bar,textvariable=self.query,width=32).pack(side='left',fill='x',expand=True,padx=(0,8))
        ttk.Label(bar,text='Loại văn bản:').pack(side='left')
        self.kind_combo=ttk.Combobox(bar,textvariable=self.kind,state='readonly',width=21)
        self.kind_combo.pack(side='left',padx=5)
        ttk.Label(bar,text='Ngày ban hành:').pack(side='left')
        ttk.Combobox(bar,textvariable=self.order,state='readonly',width=17,
                     values=('Cũ nhất trước','Mới nhất trước')).pack(side='left',padx=5)
        ttk.Button(bar,text='Xóa lọc',command=self.clear_filters).pack(side='left',padx=5)
        self.count_label=ttk.Label(self,text='');self.count_label.pack(anchor='w',pady=(2,4))
        body=ttk.Frame(self);body.pack(fill='both',expand=True)
        self.canvas=tk.Canvas(body,highlightthickness=0,bg='#F8FAFD')
        scroll=ttk.Scrollbar(body,orient='vertical',command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right',fill='y');self.canvas.pack(side='left',fill='both',expand=True)
        self.inner=ttk.Frame(self.canvas)
        self.window_id=self.canvas.create_window((0,0),window=self.inner,anchor='nw')
        self.inner.bind('<Configure>',lambda e:self.canvas.configure(scrollregion=self.canvas.bbox('all')))
        self.canvas.bind('<Configure>',self._on_stats_canvas_resize)
        # Cuộn cả khi con trỏ nằm trên thẻ, nhãn hoặc vùng trống của danh sách.
        self.canvas.bind('<MouseWheel>', self._scroll_documents)
        self.canvas.bind('<Button-4>', self._scroll_documents)
        self.canvas.bind('<Button-5>', self._scroll_documents)
        self.inner.bind('<MouseWheel>', self._scroll_documents)
        self.inner.bind('<Button-4>', self._scroll_documents)
        self.inner.bind('<Button-5>', self._scroll_documents)
        self.kind.trace_add('write',self._on_filter_change)
        self.order.trace_add('write',self._on_filter_change)
        self.query.trace_add('write',self._on_query_change)
        self.refresh_categories()

    def _on_stats_canvas_resize(self, event):
        self.canvas.itemconfigure(self.window_id, width=event.width)
        self.after_idle(self._fit_stat_cards)

    def _scroll_documents(self, event):
        # Tkinter chuyển sự kiện chuột tới widget dưới con trỏ; không bind_all
        # vì sẽ gây cuộn cả khi đang dùng các tab hoặc hộp thoại khác.
        if getattr(event, 'num', None) == 4:
            steps = -1
        elif getattr(event, 'num', None) == 5:
            steps = 1
        else:
            delta = getattr(event, 'delta', 0)
            if not delta:
                return
            steps = -int(delta / 120) if abs(delta) >= 120 else (-1 if delta > 0 else 1)
        self.canvas.yview_scroll(steps, 'units')
        return 'break'

    def _bind_document_scroll(self, widget):
        widget.bind('<MouseWheel>', self._scroll_documents)
        widget.bind('<Button-4>', self._scroll_documents)
        widget.bind('<Button-5>', self._scroll_documents)
        for child in widget.winfo_children():
            self._bind_document_scroll(child)

    def _on_filter_change(self, *_):
        if not self._batch_filters:
            self._cancel_search_timer()
            self.refresh()

    def _cancel_search_timer(self):
        if self._search_after_id is not None:
            self.after_cancel(self._search_after_id)
            self._search_after_id = None

    def _on_query_change(self, *_):
        if self._batch_filters:
            return
        self._cancel_search_timer()
        self._search_after_id = self.after(250, self._run_search)

    def _run_search(self):
        self._search_after_id = None
        if self.winfo_exists():
            self.refresh()

    def refresh_categories(self):
        self.kind_combo['values']=['Tất cả']+[r['name'] for r in list_categories('document_types')]
        if self.kind.get() not in self.kind_combo['values']:self.kind.set('Tất cả')

    def clear_filters(self):
        """Xóa toàn bộ bộ lọc nhanh và trạng thái chọn từ thẻ thống kê."""
        self._cancel_search_timer()
        self._batch_filters = True
        try:
            self.status.set('Tất cả')
            self.kind.set('Tất cả')
            self.order.set('Cũ nhất trước')
            self.query.set('')
        finally:
            self._batch_filters = False
        self.refresh()

    def choose_status(self,status):
        self.status.set(status);self.refresh()

    def rows(self):
        with db_session() as c:
            docs=c.execute('SELECT d.*,t.name AS type_name FROM documents d LEFT JOIN document_types t ON t.id=d.type_id').fetchall()
            fields=defaultdict(list)
            for r in c.execute('SELECT df.document_id,wf.name FROM document_fields df JOIN work_fields wf ON wf.id=df.field_id ORDER BY wf.name'):
                fields[r[0]].append(r[1])
            links=defaultdict(list)
            for r in c.execute('SELECT a.document_id,d.number,d.symbol FROM document_amendments a JOIN documents d ON d.id=a.amendment_id'):
                links[r[0]].append(f"{r['number']}/{r['symbol']}")
        return [(d,fields[d['id']],links[d['id']]) for d in docs]

    def filtered_rows(self,rows):
        term=search_key(self.query.get().strip())
        result=[]
        for d,fields,links in rows:
            if self.status.get()!='Tất cả' and effective_status(d)!=self.status.get():continue
            if self.kind.get()!='Tất cả' and (d['type_name'] or 'Chưa phân loại')!=self.kind.get():continue
            if term not in search_key(' '.join([d['number'],d['symbol'],d['summary'],d['agency'],d['notes'],d['amendment_text'] or '',*fields,*links])):continue
            result.append((d,fields,links))
        result.sort(key=lambda x:(x[0]['issued'],x[0]['number'],x[0]['symbol']),reverse=self.order.get()=='Mới nhất trước')
        return result

    def refresh(self):
        if not self.winfo_exists():return
        rows=self.rows();filtered=self.filtered_rows(rows)
        for key,btn in self.status_cards.items():
            count=len(rows) if key=='Tất cả' else sum(effective_status(r[0])==key for r in rows)
            btn.configure(text=f'{count}\n'+('TỔNG SỐ' if key=='Tất cả' else key.upper()),
                          relief='sunken' if self.status.get()==key else 'ridge')
        self.count_label.configure(text=f'Hiển thị {len(filtered)} / {len(rows)} văn bản  |  Nhấp đúp để mở văn bản')
        self._stat_fit_callbacks = []
        for child in self.inner.winfo_children():child.destroy()
        for d,fields,links in filtered:
            card = tk.Frame(
            self.inner,
            bg='white',
            bd=0,
            relief='flat',
            highlightbackground="#69A0F1",  # Viền bình thường
            highlightcolor='#3B82F6',       # Viền khi focus
            highlightthickness=1,             # Độ dày viền: 1 pixel #Xóa hoàn toàn viền = 0
            padx=7,
            pady=3
            )
            card.pack(fill='x',padx=3,pady=2)
            top=tk.Frame(card,bg='white');top.pack(fill='x')
            status=effective_status(d)
            badge=tk.Label(top,text=status,bg={'Còn hiệu lực':'#BFEBC9','Hết hiệu lực':'#F4C4C4','Cần rà soát':'#FBE9A5'}.get(status,'#eee'),padx=8)
            badge.pack(side='right',padx=(6,0))
            title_label=tk.Label(top,text=f"{d['number']}/{d['symbol']} – {d['summary']}",font=('Segoe UI',11,'bold'),
                     bg='white',anchor='w',justify='left',wraplength=600)
            title_label.pack(side='left',fill='x',expand=True)
            detail_label=tk.Label(card,text=f"Cơ quan ban hành: {d['agency']}    |    Ngày ban hành: {display_date(d['issued'])}    |    Lĩnh vực: {'; '.join(fields) if fields else 'Chưa phân loại'}",
                     bg='white',anchor='w',justify='left',wraplength=600)
            detail_label.pack(fill='x',pady=(2,0))
            related='; '.join(links+([d['amendment_text']] if d['amendment_text'] else [])) or 'Chưa có thông tin'
            related_label=tk.Label(card,text='Được sửa đổi, bổ sung bởi: '+related,
                     bg='white',anchor='w',justify='left',wraplength=600)
            related_label.pack(fill='x',pady=(1,0))
            # Chỉ tính xuống dòng sau khi Canvas đã ổn định kích thước.
            # Không dùng chiều rộng của card (có thể thay đổi do chính wraplength).
            def fit_card_text(event=None, title=title_label, tag=badge,
                              details=(detail_label, related_label), container=card):
                if not container.winfo_exists():
                    return
                available = max(100, self.canvas.winfo_width() - 28)
                title_width = max(100, available - tag.winfo_reqwidth() - 20)
                if int(title.cget('wraplength')) != title_width:
                    title.configure(wraplength=title_width)
                for label in details:
                    if int(label.cget('wraplength')) != available:
                        label.configure(wraplength=available)
            self._stat_fit_callbacks.append(fit_card_text)
            # Nhấp đúp vào bất kỳ vị trí nào trên thẻ để mở trực tiếp cửa sổ chỉnh sửa.
            def open_doc(_event=None, doc_id=d['id']):
                Editor(self.app, doc_id)
            for widget in [card,*card.winfo_children(),*top.winfo_children()]:
                widget.bind('<Double-Button-1>',open_doc)
            self._bind_document_scroll(card)
        # Chạy một lần sau khi bố cục đã cập nhật; các lần resize do Canvas điều phối.
        self.after_idle(self._fit_stat_cards)


    def _fit_stat_cards(self):
        if not self.winfo_exists():
            return
        for callback in getattr(self, '_stat_fit_callbacks', ()):
            callback()

    def export(self):
        path=filedialog.asksaveasfilename(parent=self,defaultextension='.xlsx',initialfile='Thong_ke_van_ban.xlsx',filetypes=[('Excel','*.xlsx')])
        if not path:return
        try:
            from openpyxl import Workbook
            wb=Workbook();ws=wb.active;ws.title='TONG_HOP'
            rows=self.rows();subset=self.filtered_rows(rows)
            ws.append(['Chỉ tiêu','Số lượng'])
            for key in ('Tất cả',*VALID_STATUSES):
                ws.append([key,len(rows) if key=='Tất cả' else sum(effective_status(d)==key for d,_,_ in rows)])
            # Tổng hợp chi tiết theo loại, lĩnh vực, cơ quan và năm ban hành.
            from collections import Counter
            groupings = (
                ('THEO_LOAI', Counter((d['type_name'] or 'Chưa phân loại') for d,_,_ in subset)),
                ('THEO_LINH_VUC', Counter(f for _,fields,_ in subset for f in (fields or ['Chưa phân loại']))),
                ('THEO_CO_QUAN', Counter(d['agency'] for d,_,_ in subset)),
                ('THEO_NAM', Counter(d['issued'][:4] for d,_,_ in subset)),
            )
            for sheet_name,counts in groupings:
                sheet=wb.create_sheet(sheet_name)
                sheet.append(['Nhóm','Số văn bản'])
                for label,amount in sorted(counts.items()):sheet.append([label,amount])
            ws2=wb.create_sheet('DANH_SACH');ws2.append(['Số/Ký hiệu','Trích yếu','Cơ quan','Ngày ban hành','Loại văn bản','Lĩnh vực','Trạng thái','Ngày hết hiệu lực','Được sửa đổi, bổ sung bởi'])
            for d,fields,links in subset:
                ws2.append([f"{d['number']}/{d['symbol']}",d['summary'],d['agency'],display_date(d['issued']),d['type_name'] or 'Chưa phân loại','; '.join(fields),effective_status(d),display_date(d['expiry_date']) if d['expiry_date'] else '', '; '.join(links+([d['amendment_text']] if d['amendment_text'] else []))])
            for sheet in wb:
                sheet.freeze_panes='A2';sheet.auto_filter.ref=sheet.dimensions
            wb.save(path)
            messagebox.showinfo('Thống kê',f'Đã xuất: {path}',parent=self)
        except Exception as exc:messagebox.showerror('Xuất thống kê',str(exc),parent=self)


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_NAME) # Kích thước
        # Icon cửa sổ chính và các hộp thoại Toplevel trên Windows.
        icon_file = resource_path('80namCAND.ico')
        if icon_file.is_file():
            try:
                self.iconbitmap(default=str(icon_file))
            except tk.TclError:
                pass  # Không cản trở khởi động nếu icon không đọc được.
        self.geometry('1200x650+50+25') #self.geometry('RỘNGxCAO+X+Y')
        self.minsize(900,520)
        self._tray_commands = queue.SimpleQueue()
        self._tray_icon = None
        self._tray_thread = None
        self._really_exiting = False
        self.protocol('WM_DELETE_WINDOW', self.on_close)
        self.after(150, self._process_tray_commands)
        # Không phát bù các mốc giờ đã qua khi vừa mở ứng dụng.
        now = datetime.now()
        self._alert_last_slots = {f'{now.date().isoformat()} {hour}'
                                  for hour in ALERT_AUTO_TIMES if hour <= now.strftime('%H:%M')}
        self._alert_popup = None
        self.after(1000, self._check_scheduled_alerts)
        self.filter_var = tk.StringVar()
        self.type_filter_var = tk.StringVar(value='Tất cả')
        self.field_filter_var = tk.StringVar(value='Tất cả')
        self.report_filter_ids = None
        self.report_filter_label = ''
        self._search_after_id = None
        self._batch_search_filters = False
        self.filter_var.trace_add('write',self._on_search_text_change)
        self.type_filter_var.trace_add('write',self._on_search_option_change)
        self.field_filter_var.trace_add('write',self._on_search_option_change)
        self.button_settings = {
            'height': BUTTON_HEIGHT, 'gap': BUTTON_GAP,
            'row_gap': BUTTON_ROW_GAP, 'font_size': BUTTON_FONT_SIZE,
            'min_width': BUTTON_WIDTH_MIN
        }
        style = ttk.Style(self)  # Tùy chỉnh các thẻ tab

        style.configure(
        'Pastel.TNotebook',
        background='#F1F6FC',
        borderwidth=0   )

        style.configure( 'Pastel.TNotebook.Tab', foreground='#0066CC',  # Chữ xanh khi chưa chọn
        background='#D7E8F8', font=('Segoe UI', TAB_FONT_SIZE, 'italic'),
        padding=(TAB_PADDING_X, TAB_PADDING_Y))

        style.map( 'Pastel.TNotebook.Tab',
                  foreground=[
            ('selected', '#CC0000'),   # Chữ đỏ khi chọn
            ('!selected', '#0066CC')   # Chữ xanh khi chưa chọn
            ], background=[
            ('selected', '#FFFFFF'),   # Nền trắng khi chọn
            ('!selected', '#D7E8F8')   # Nền xanh nhạt khi chưa chọn
            ] , font=[
            ('selected', ('Segoe UI', TAB_FONT_SIZE, 'bold italic')),
            ('!selected', ('Segoe UI', TAB_FONT_SIZE, 'normal'))
            ])
        self.configure(bg='#F1F6FC')
        # Đặt status bar trước các khung nội dung để pack dành chỗ ở đáy cửa sổ.
        # Notebook chỉ được mở rộng trong phần diện tích còn lại.
        self.status = tk.StringVar()
        self.status_bar = ttk.Label(
            self, textvariable=self.status, relief='sunken', anchor='w', padding=5,
            font=('Segoe UI', 11, 'bold'), #Kích thước chữ status_bar
            foreground="#100291")
        self.status_bar.pack(side='bottom', fill='x')
        self.toolbar = tk.Frame(self, bg='#F1F6FC')
        self.toolbar.pack(fill='x', padx=10, pady=(8, BUTTON_ROW_GAP))
        # Khung nhận diện đặt nổi, không tham gia bố cục pack/grid.
        # Vì vậy kích thước toolbar, ô tìm kiếm và Notebook không thay đổi.
        self.logo_image = None
        self.brand_frame = tk.Frame(self, bg='#F1F6FC', bd=0)
        tk.Label(self.brand_frame, text='PHẦN MỀM\nQUẢN LÝ\nVĂN BẢN',
                 font=('Verdana', 15, 'bold'), fg='#17365D',
                 bg='#F1F6FC', justify='center', anchor='center').pack(side='right', padx=(0, 7))
        # Giữ justify='right', anchor='e' để 3 dòng chữ thẳng mép phải
        # .pack(side='left right' > vị trí chữ và logo)
        logo_file = resource_path('LogoCAND.png')
        if logo_file.is_file():
            try:
                from PIL import Image, ImageTk
                original = Image.open(logo_file).convert('RGBA')
                original.thumbnail((LOGO_SIZE, LOGO_SIZE), Image.Resampling.LANCZOS)
                self.logo_image = ImageTk.PhotoImage(original)
                tk.Label(self.brand_frame, image=self.logo_image,
                         bg='#F1F6FC', bd=0).pack(side='left')
            except (tk.TclError, OSError) as exc:
                self.logo_image = None
                print(f"Không thể tải logo: {exc}", file=sys.stderr)
        self.brand_frame.place(relx=1.0, x=-BRAND_RIGHT,
                               y=BRAND_TOP, anchor='ne')
        self.button_specs = [
            ('btn_add', '+ Thêm văn bản', lambda: Editor(self), 'green', True),
            ('btn_edit', 'Sửa văn bản', self.edit, 'blue', True),
            ('btn_delete', 'Xóa văn bản', self.delete, 'red', True),
            ('btn_done', 'Hoàn thành / Hoàn tác', self.toggle_done, 'yellow', True),
            ('btn_result', 'Kết quả báo cáo', self.edit_report_result, 'purple', True),
        ]
        self.toolbar_buttons = {}
        for name, label, callback, palette, enabled in self.button_specs:
            self.toolbar_buttons[name] = self._toolbar_button(
                self.toolbar, label, callback, palette, enabled)

        # Menu Cài đặt giữ nguyên các tác vụ, không mở cửa sổ setting riêng.
        menu_holder = tk.Frame(self.toolbar, bg='#F1F6FC', height=BUTTON_HEIGHT)
        menu_holder.pack(side='left', padx=(0, BUTTON_GAP))
        menu_holder.pack_propagate(False)
        settings_btn = tk.Menubutton(menu_holder, text='Cài đặt ▾', relief='flat',
                                    bg="#F0F8FF",               # Màu nền bình thường
                                    activebackground="#F0F8FF", # Màu nền khi rê chuột/nhấn
                                    fg="#000000",               # Màu chữ bình thường
                                    activeforeground="#FF0000", # Màu chữ khi nhấn 
                                     #bg=PASTEL['purple'][0], activebackground=PASTEL['purple'][1],
                                     #fg='#243447', 
                                     font=('Segoe UI', BUTTON_FONT_SIZE,'bold italic'),
                                     padx=10, bd=1, cursor='hand2')
        settings_btn.pack(fill='both', expand=True)
        settings_menu = tk.Menu(settings_btn, tearoff=False, font=('Segoe UI', 10))
        settings_menu.add_command(label='Quản lý loại văn bản...',command=lambda:manage_category(self,'document_types',self.refresh_categories))
        settings_menu.add_command(label='Quản lý lĩnh vực...',command=lambda:manage_category(self,'work_fields',self.refresh_categories))
        settings_menu.add_separator()
        settings_menu.add_command(label='Nhập Excel khôi phục...', command=self.import_file)
        settings_menu.add_command(label='Sao lưu Excel khôi phục...', command=self.export_file)
        settings_menu.add_command(label='Tạo Excel Thống kê Văn bản', command=lambda: self.stats_panel.export())
        settings_menu.add_separator()
        settings_menu.add_command(label='Sao lưu cơ sở dữ liệu...', command=self.backup)
        settings_menu.add_command(label='Khôi phục dữ liệu...', command=self.restore_data)
        settings_menu.add_command(label='Kiểm tra toàn bộ liên kết file...', command=self.check_all_links)
        settings_menu.add_command(label='Xem lịch sử thay đổi (.txt)', command=self.open_change_history)
        settings_menu.add_separator()
        self.startup_var = tk.BooleanVar(value=startup_enabled())
        settings_menu.add_checkbutton(label='Khởi động cùng Windows',
                                      variable=self.startup_var,
                                      command=self.toggle_startup_setting)
        settings_btn.configure(menu=settings_menu)
        self.update_idletasks()
        menu_holder.configure(width=max(BUTTON_WIDTH_MIN, settings_btn.winfo_reqwidth()))
        # Thanh tim kiem gon: can le phai ngang nut Cai dat, tranh vung logo.
        # Entry co gian; hai combobox giu do rong ngan gon.
        search = tk.Frame(self, bg='#F1F6FC', padx=10, pady=2)
        search.pack(fill='x', padx=(0, 280))
        # Ô tìm kiếm có chiều rộng giới hạn, không tự kéo dài hết hàng.
        # Thay SEARCH_ENTRY_WIDTH để tùy chỉnh (đơn vị: ký tự).
        SEARCH_ENTRY_WIDTH =55  #Kích thước Ô tìm kiếm
        search.grid_columnconfigure(1, weight=0)
        tk.Label(search, text='Tìm kiếm:', bg='#F1F6FC',
                 font=('Segoe UI', 12, 'bold')).grid(row=0, column=0, sticky='w')
        ttk.Entry(search, textvariable=self.filter_var, width=SEARCH_ENTRY_WIDTH).grid(
            row=0, column=1, sticky='w', padx=(8, 10))
        # Nút X nằm ngay sau ô tìm kiếm, trước bộ lọc Loại văn bản.
        # Giữ nguyên hàm xóa đồng thời từ khóa và hai bộ lọc.
        tk.Button(
            search,
            text='X',
            width=3,
            command=self.clear_search_filters,
            bg='#DC3545',              # Nền đỏ
            fg='white',                # Chữ trắng
            activebackground='#B02A37', # Đỏ đậm khi nhấn
            activeforeground='white',
            font=('Segoe UI', 10, 'bold'),
            relief='flat',
            bd=0,
            
            cursor='hand2'
        ).grid(
            row=0, column=2, sticky='w', padx=(0, 10) )
                
        tk.Label(search, text='Loại văn bản:', bg='#F1F6FC').grid(
            row=0, column=3, sticky='w')
        self.type_filter_combo = ttk.Combobox(
            search, textvariable=self.type_filter_var, state='readonly', width=12)
        self.type_filter_combo.grid(row=0, column=4, sticky='w', padx=(4, 8))
        tk.Label(search, text='Lĩnh vực:', bg='#F1F6FC').grid(
            row=0, column=5, sticky='w')
        self.field_filter_combo = ttk.Combobox(
            search, textvariable=self.field_filter_var, state='readonly', width=14)
        self.field_filter_combo.grid(row=0, column=6, sticky='w', padx=(4, 6))

        # Dong bo mep phai thanh tim kiem voi mep phai nut Cai dat
        # khi thay doi kich thuoc cua so; khong de thanh tim kiem lan vao logo.
        def _align_search_bar(event=None):
            if event is not None and event.widget is not self:
                return
            right_edge = menu_holder.winfo_x() + menu_holder.winfo_width()
            if right_edge <= 0:
                return
            reserved = max(0, self.winfo_width() - right_edge - 10)
            current = search.pack_info().get('padx', (0, 0))
            if isinstance(current, (tuple, list)):
                current = int(current[-1])
            else:
                current = int(current)
            if current != reserved:
                search.pack_configure(padx=(0, reserved))
        self.bind('<Configure>', _align_search_bar, add='+')
        self.after_idle(_align_search_bar)
        self.refresh_categories()
        self.tabs = ttk.Notebook(self, style='Pastel.TNotebook')
        self.tabs.pack(fill='both',expand=True,padx=10,pady=8)
        self.doc_frame=ttk.Frame(self.tabs)
        self.tabs.add(self.doc_frame,text='Quản Lý Văn Bản')
        self.doc_tree=DocumentTable(self.doc_frame)
        self.doc_tree.pack(fill='both',expand=True)
        for key in DocumentTable.KEYS:
            self.doc_tree.heading(key,command=lambda col=key:self.sort_tree(self.doc_tree,col,False))
        self.report_tree = self.make_tree('Theo Dõi Báo Cáo',('number','summary','kind','due','count','status'),
                                          ('Số/Ký hiệu','Trích yếu','Loại báo cáo','Thời hạn','Bộ đếm','Trạng thái'),(145,250,110,110,150,100))
        self.report_filter_bar = ttk.Frame(self.report_frame)
        self.report_filter_bar.grid(row=2, column=0, columnspan=2, sticky='ew', padx=5, pady=3)
        # 3.5.11: Bo loc hien thi, khong thay doi cac ky trong SQLite.
        self.report_range_var = tk.StringVar(value='7 ngày')
        self.report_state_var = tk.StringVar(value='Chưa hoàn thành')
        self.report_nearest_var = tk.BooleanVar(value=True)
        ttk.Label(self.report_filter_bar, text='Thời gian:').pack(side='left', padx=(0, 4))
        ttk.Combobox(self.report_filter_bar, textvariable=self.report_range_var,
                     values=('7 ngày', '30 ngày', 'Năm hiện tại', 'Tất cả'),
                     state='readonly', width=15).pack(side='left', padx=(0, 8))
        ttk.Label(self.report_filter_bar, text='Trạng thái:').pack(side='left', padx=(0, 4))
        ttk.Combobox(self.report_filter_bar, textvariable=self.report_state_var,
                     values=('Chưa hoàn thành', 'Đã hoàn thành', 'Tất cả'),
                     state='readonly', width=16).pack(side='left', padx=(0, 8))
        ttk.Checkbutton(self.report_filter_bar, text='Kỳ gần nhất',
                        variable=self.report_nearest_var,
                        command=self.refresh).pack(side='left', padx=(0, 8))
        self.report_range_var.trace_add('write', lambda *_: self.refresh())
        self.report_state_var.trace_add('write', lambda *_: self.refresh())
        self.report_filter_text = tk.StringVar(value='Danh sách đầy đủ')
        ttk.Label(self.report_filter_bar, textvariable=self.report_filter_text,
                  font=('Segoe UI', 11, 'italic'), #Kích thước hiển thị lọc
                  foreground="#00028D").pack(side='left')
        ttk.Button(self.report_filter_bar, text='Xóa bộ lọc',
                   command=self.clear_report_filter).pack(side='right')
        self.calendar_frame = ttk.Frame(self.tabs)
        self.tabs.add(self.calendar_frame, text='Lịch Tổng Hợp')
        self.report_calendar = ReportCalendar(self.calendar_frame, self)
        self.report_calendar.pack(fill='both', expand=True)
        self.dashboard_frame = ttk.Frame(self.tabs)
        self.tabs.add(self.dashboard_frame, text='TỔNG QUAN')
        self.dashboard = Dashboard(self.dashboard_frame, self)
        self.tabs.insert(0, self.dashboard_frame)
        self.tabs.select(self.dashboard_frame)

        self.dashboard.pack(fill='both', expand=True)
        self.stats_frame=ttk.Frame(self.tabs)
        self.tabs.add(self.stats_frame,text='THỐNG KÊ VĂN BẢN')
        self.stats_panel=DocumentStatistics(self.stats_frame,self)
        self.stats_panel.pack(fill='both',expand=True)
        self.doc_tree.bind('<Double-1>',lambda _:self.edit())
        self.report_tree.bind('<Double-1>',lambda _:self.edit_report_result())
        self.refresh()
        # Nâng khung logo lên trên các widget được tạo sau nó.
        self.after_idle(self.brand_frame.lift)
        self.after(300,self.startup_popup)

    def refresh_categories(self):
        if hasattr(self,'type_filter_combo'):
            self.type_filter_combo['values']=['Tất cả']+[r['name'] for r in list_categories('document_types')]
            self.field_filter_combo['values']=['Tất cả']+[r['name'] for r in list_categories('work_fields')]
            if self.type_filter_var.get() not in self.type_filter_combo['values']: self.type_filter_var.set('Tất cả')
            if self.field_filter_var.get() not in self.field_filter_combo['values']: self.field_filter_var.set('Tất cả')
        if hasattr(self,'stats_panel'): self.stats_panel.refresh_categories()
        self.refresh()

    def _cancel_search_timer(self):
        if self._search_after_id is not None:
            self.after_cancel(self._search_after_id)
            self._search_after_id = None

    def _on_search_text_change(self, *_):
        if self._batch_search_filters:
            return
        self._cancel_search_timer()
        self._search_after_id = self.after(250, self._run_search_refresh)

    def _run_search_refresh(self):
        self._search_after_id = None
        if self.winfo_exists():
            self.refresh(update_related=False)

    def _on_search_option_change(self, *_):
        if not self._batch_search_filters:
            self._cancel_search_timer()
            self.refresh(update_related=False)

    def clear_search_filters(self):
        """Xóa cả ba điều kiện trên thanh tìm kiếm chính."""
        self._cancel_search_timer()
        self._batch_search_filters = True
        try:
            self.filter_var.set('')
            self.type_filter_var.set('Tất cả')
            self.field_filter_var.set('Tất cả')
        finally:
            self._batch_search_filters = False
        self.refresh(update_related=False)

    def show_document_from_stats(self,doc_id):
        self.type_filter_var.set('Tất cả')
        self.field_filter_var.set('Tất cả')
        self.filter_var.set('')
        self.tabs.select(self.doc_frame)
        self.refresh()
        self.doc_tree.selected=doc_id
        self.doc_tree.redraw()

    def _toolbar_button(self, parent, label, callback, palette, enabled=True):
        """Nút có chiều cao chính xác theo pixel nhờ khung chứa cố định."""
        colors = PASTEL[palette]
        holder = tk.Frame(parent, bg='#F1F6FC', height=self.button_settings['height'])
        holder.pack(side='left', padx=(0, self.button_settings['gap']))
        holder.pack_propagate(False)
        btn = tk.Button(holder, text=label, command=callback,
                        bg=colors[0], activebackground=colors[1], fg='#003366',
                        activeforeground='#CC0000', font=('Segoe UI', self.button_settings['font_size'], 'bold'),
                        relief='flat', bd=1, padx=10, pady=0, cursor='hand2',
                        state='normal' if enabled else 'disabled')
        btn.pack(fill='both', expand=True)
        self.update_idletasks()
        holder.configure(width=max(self.button_settings['min_width'], btn.winfo_reqwidth()))
        btn.bind('<Enter>', lambda e: btn.configure(bg=colors[1]) if btn['state']=='normal' else None)
        btn.bind('<Leave>', lambda e: btn.configure(bg=colors[0]))
        return btn

    def make_tree(self,title,keys,labels,widths):
        frame=ttk.Frame(self.tabs)
        self.tabs.add(frame,text=title)
        if title == 'Theo Dõi Báo Cáo':
            self.report_frame = frame
        tree_style = 'Report.Treeview' if title == 'Theo Dõi Báo Cáo' else 'Treeview'
        if title == 'Theo Dõi Báo Cáo':
            style = ttk.Style(self)
            style.configure('Report.Treeview',
                            font=('Segoe UI', REPORT_TABLE_FONT_SIZE),
                            rowheight=REPORT_TABLE_ROW_HEIGHT)
            style.configure('Report.Treeview.Heading',
                            font=('Segoe UI', REPORT_HEADER_FONT_SIZE, 'bold'))
        tree=ttk.Treeview(frame, columns=keys, show='headings',
                          selectmode='browse', style=tree_style)
        for k,label,w in zip(keys,labels,widths):
            tree.heading(k,text=label,command=lambda col=k,t=tree:self.sort_tree(t,col,False))
            tree.column(k,width=w,minwidth=75,stretch=(k == 'summary'))
        for tag,color in [('overdue','#ffc5c5'),('urgent','#ffd6d6'),('orange','#ffe3c2'),
                          ('yellow','#fff6c7'),('normal','#dff4df'),('done','#d5f0e1')]:
            tree.tag_configure(tag,background=color)
        sb=ttk.Scrollbar(frame,orient='vertical',command=tree.yview)
        hsb=ttk.Scrollbar(frame,orient='horizontal',command=tree.xview)
        tree.configure(yscrollcommand=sb.set,xscrollcommand=hsb.set)
        tree.grid(row=0,column=0,sticky='nsew')
        sb.grid(row=0,column=1,sticky='ns')
        hsb.grid(row=1,column=0,sticky='ew')
        frame.columnconfigure(0,weight=1)
        frame.rowconfigure(0,weight=1)
        return tree

    def sort_tree(self,tree,col,reverse):
        def sort_key(value):
            value = str(value).strip()
            for fmt in ('%d/%m/%Y', '%m/%Y'):
                try:
                    return (0, datetime.strptime(value, fmt).date().isoformat())
                except ValueError:
                    pass
            if re.fullmatch(r'\d+', value):
                return (1, int(value))
            return (2, tuple(int(part) if part.isdigit() else part.casefold()
                             for part in re.split(r'(\d+)', value)))
        rows=[(sort_key(tree.set(item,col)),item) for item in tree.get_children('')]
        rows.sort(key=lambda row: row[0], reverse=reverse)
        for i,(_,item) in enumerate(rows):tree.move(item,'',i)
        tree.heading(col,command=lambda:self.sort_tree(tree,col,not reverse))

    def set_report_filter(self, ids, label):
        self.report_filter_ids = set(ids)
        names = {'pending': 'Chưa hoàn thành', 'completed': 'Đã hoàn thành',
                 'overdue': 'Quá hạn'}
        self.report_filter_label = names.get(label, label)
        self.tabs.select(self.report_frame)
        self.refresh()

    def clear_report_filter(self):
        # Reset tat ca bo loc bao cao ve mac dinh, khong xoa du lieu.
        self.report_filter_ids = None
        self.report_filter_label = ''
        self.report_range_var.set('7 ngày')
        self.report_state_var.set('Chưa hoàn thành')
        self.report_nearest_var.set(True)
        self.refresh()

    def refresh(self, update_related=True):
        self._cancel_search_timer()
        if not hasattr(self,'doc_tree'):
            return
        term=search_key(self.filter_var.get().strip())
        chosen_type=self.type_filter_var.get()
        chosen_field=self.field_filter_var.get()
        reports=all_reports()
        with db_session() as c:
            docs=c.execute('SELECT * FROM documents ORDER BY issued DESC').fetchall()
            type_names={r['id']:r['name'] for r in c.execute('SELECT id,name FROM document_types')}
            doc_fields=defaultdict(set)
            for r in c.execute('SELECT df.document_id,wf.name FROM document_fields df JOIN work_fields wf ON wf.id=df.field_id'):
                doc_fields[r[0]].add(r[1])
        for t in (self.doc_tree,self.report_tree):
            t.delete(*t.get_children())
        reports_by_doc = defaultdict(list)
        for report in reports:
            if not report['completed_date']:
                reports_by_doc[report['document_id']].append(report)
        for d in docs:
            if chosen_type!='Tất cả' and type_names.get(d['type_id'],'Chưa phân loại')!=chosen_type: continue
            if chosen_field!='Tất cả' and chosen_field not in doc_fields[d['id']]: continue
            name=f"{d['number']}/{d['symbol']}"
            if term not in search_key(' '.join((name,d['agency'],d['summary'],d['notes']))):
                continue
            relevant=reports_by_doc.get(d['id'], ())
            next_r=min(relevant,key=lambda r:r['due_date']) if relevant else None
            label,tag=report_display(next_r)[1] if next_r else ('Không có hạn','done')
            self.doc_tree.insert('', 'end',iid=d['id'],values=(name,display_date(d['issued']),d['agency'],d['summary'],d['security_level'],d['notes'],
                                  report_display(next_r)[0] if next_r else '',label),tags=(tag,))
        # Loc trong bo nho: giu nguyen toan bo lich su va lich lap trong DB.
        from datetime import timedelta
        today = date.today()
        mode = self.report_range_var.get()
        state = self.report_state_var.get()
        selected_reports = []
        for r in reports:
            if self.report_filter_ids is not None and r['id'] not in self.report_filter_ids:
                continue
            name = f"{r['number']}/{r['symbol']}"
            if term not in search_key(' '.join((name, r['summary'], r['kind']))):
                continue
            completed = bool(r['completed_date'])
            if state == 'Chưa hoàn thành' and completed:
                continue
            if state == 'Đã hoàn thành' and not completed:
                continue
            due = date.fromisoformat(r['due_date'])
            # Ky thang/nam khong duoc coi la qua han chinh xac.
            if mode != 'Tất cả':
                if mode == 'Năm hiện tại':
                    if due.year != today.year:
                        continue
                else:
                    days = {'7 ngày': 7, '30 ngày': 30}[mode]
                    # Qua han chua xong van phai hien thi, ke ca qua han lau.
                    overdue = (not completed and r['precision'] == 'day' and due < today)
                    if not overdue and not (today <= due <= today + timedelta(days=days)):
                        continue
            selected_reports.append(r)
        # Chi gon cac ky chua hoan thanh trong cung lich (document + kind).
        # Dashboard loc ID cu the: khong gon de tranh an mat ky duoc chon.
        if self.report_nearest_var.get() and self.report_filter_ids is None:
            nearest = {}
            for r in selected_reports:
                if r['completed_date']:
                    nearest[('completed', r['id'])] = r
                else:
                    key = (r['document_id'], r['kind'])
                    old = nearest.get(key)
                    if old is None or r['due_date'] < old['due_date']:
                        nearest[key] = r
            selected_reports = sorted(nearest.values(),
                                      key=lambda r: (r['due_date'], r['number']))
        for r in selected_reports:
            name = f"{r['number']}/{r['symbol']}"
            due_label, (label, tag) = report_display(r)
            self.report_tree.insert('', 'end', iid=r['id'],
                                    values=(name, r['summary'], r['kind'], due_label,
                                            label, 'Hoàn thành' if r['completed_date'] else 'Chưa xong'),
                                    tags=(tag,))
        pending=sum(not r['completed_date'] for r in reports)
        overdue=sum(not r['completed_date'] and r['precision']=='day' and r['due_date']<date.today().isoformat() for r in reports)
        self.doc_tree.redraw()
        self.report_filter_text.set(
            f'Bộ lọc Dashboard: {self.report_filter_label} — '
            f'{len(self.report_tree.get_children())} kỳ' if self.report_filter_ids is not None
            else f'{self.report_range_var.get()} • {self.report_state_var.get()} • {len(selected_reports)} kỳ (tổng {len(reports)})')
        self.autosize_columns()
        if update_related:
            if hasattr(self, 'dashboard'):
                self.dashboard.set_data(reports, docs)
            if hasattr(self, 'report_calendar'):
                self.report_calendar.set_reports(reports)
            if hasattr(self,'stats_panel'): self.stats_panel.refresh()
        self.status.set(f'Tổng {len(docs)} văn bản | {pending} kỳ báo cáo chưa hoàn thành | {overdue} kỳ quá hạn')

    def autosize_columns(self):
        """Đo đầy đủ nội dung 5 cột ngắn trong tab Theo dõi báo cáo.

        Trích yếu giữ nguyên chiều rộng và chế độ stretch hiện tại.
        Khi không đủ chỗ, dùng thanh cuộn ngang sẵn có.
        """
        import tkinter.font as tkfont
        style = ttk.Style(self)
        font_name = style.lookup('Report.Treeview', 'font') or 'TkDefaultFont'
        try:
            font = tkfont.nametofont(font_name)
        except tk.TclError:
            font = tkfont.Font(font=font_name)
        header_font_name = style.lookup('Report.Treeview.Heading', 'font')
        try:
            heading_font = tkfont.nametofont(header_font_name) if header_font_name else font
        except tk.TclError:
            heading_font = tkfont.Font(font=header_font_name)
        tree = self.report_tree
        for col in tree['columns']:
            if col == 'summary':
                tree.column(col, stretch=True)
                continue
            label = tree.heading(col, 'text')
            width = max(75, heading_font.measure(label) + 26)
            for iid in tree.get_children(''):
                value = str(tree.set(iid, col) or '')
                width = max(width, font.measure(value) + 24)
            tree.column(col, width=width, minwidth=width, stretch=False)

    def selected_doc(self):
        current = self.tabs.select()
        if current == str(self.doc_frame):
            selection = self.doc_tree.selection()
            return selection[0] if selection else None
        if current == str(self.dashboard_frame):
            return self.dashboard.selected_document_id()
        if current == str(self.calendar_frame):
            report_id = self.report_calendar.selected_report_id()
        else:
            selection = self.report_tree.selection()
            report_id = selection[0] if selection else None
        if not report_id:
            return None
        with db_session() as c:
            r = c.execute('SELECT s.document_id FROM report_history h '
                          'JOIN schedules s ON h.schedule_id=s.id WHERE h.id=?',
                          (report_id,)).fetchone()
            return r['document_id'] if r else None

    def edit(self):
        doc=self.selected_doc()
        if doc:Editor(self,doc)
        else:messagebox.showinfo('Chọn văn bản','Hãy chọn một văn bản trước')

    def delete(self):
        doc = self.selected_doc()
        if not doc:
            messagebox.showinfo('Chọn văn bản', 'Hãy chọn một văn bản trước.', parent=self)
            return
        if not messagebox.askyesno('Xác nhận xóa',
                'Xóa văn bản cùng toàn bộ lịch báo cáo và lịch sử liên quan?\n'
                'Dữ liệu sẽ được sao lưu trước khi xóa.', icon='warning', parent=self):
            return
        try:
            backup_db(before_delete=True)  # Sao lưu riêng trước khi xóa; lỗi thì không xóa.
            with db_session() as c:
                before_change = document_snapshot(c, doc)
                c.execute('DELETE FROM documents WHERE id=?', (doc,))
                write_document_change(c, doc, 'Xóa văn bản', before_change, None)
            self.refresh()
        except Exception as exc:
            messagebox.showerror('Không thể xóa văn bản',
                f'Thao tác đã dừng do lỗi:\n{exc}', parent=self)

    def selected_report_id(self):
        current = self.tabs.select()
        if current == str(self.calendar_frame):
            return self.report_calendar.selected_report_id()
        if current == str(self.report_frame):
            selected = self.report_tree.selection()
            return selected[0] if selected else None
        if current == str(self.dashboard_frame):
            return self.dashboard.selected_report_id()
        return None

    def edit_report_result(self):
        report_id = self.selected_report_id()
        if not report_id:
            messagebox.showinfo('Kết quả báo cáo',
                'Hãy chọn một kỳ tại tab Theo dõi báo cáo, Lịch báo cáo hoặc Tổng quan.',parent=self)
            return
        ReportResultEditor(self, report_id)

    def toggle_report_id(self, report_id):
        """Mo bieu mau hoan thanh, hoac xac nhan hoan tac dung mot ky."""
        with db_session() as c:
            row=c.execute('SELECT completed_date FROM report_history WHERE id=?',(report_id,)).fetchone()
        if row is None:return
        if row['completed_date']:
            if not messagebox.askyesno('Hoàn tác báo cáo',
                    'Chuyển kỳ báo cáo này về chưa hoàn thành? Dữ liệu kết quả vẫn được giữ.',parent=self):
                return
            now=datetime.now().isoformat(timespec='seconds')
            with db_session() as c:
                r=c.execute('SELECT result_symbol,result_attachment,result_notes FROM report_history WHERE id=?',(report_id,)).fetchone()
                c.execute('UPDATE report_history SET completed_date=NULL,result_updated=? WHERE id=?',(now,report_id))
                c.execute("""INSERT INTO result_audit
                    (id,report_id,action,changed_at,completed_date,result_symbol,result_attachment,result_notes)
                    VALUES (?,?,?,?,?,?,?,?)""",
                    (str(uuid.uuid4()),report_id,'Hoàn tác',now,None,r['result_symbol'],r['result_attachment'],r['result_notes']))
            self.refresh()
        else:
            ReportResultEditor(self,report_id)

    def toggle_done(self):
        current = self.tabs.select()
        if current == str(self.calendar_frame):
            report_id = self.report_calendar.selected_report_id()
        elif current == str(self.report_frame):
            selection = self.report_tree.selection()
            report_id = selection[0] if selection else None
        elif current == str(self.dashboard_frame):
            report_id = self.dashboard.selected_report_id()
        else:
            messagebox.showinfo('Theo dõi báo cáo',
                                'Hãy chọn kỳ báo cáo trong tab Theo dõi báo cáo, Lịch báo cáo hoặc Tổng quan.')
            return
        if report_id:
            self.toggle_report_id(report_id)

    def import_file(self):
        path=filedialog.askopenfilename(filetypes=[('Excel','*.xlsx')])
        if not path:return
        try:
            counts=import_excel(path)
            self.refresh()
            messagebox.showinfo('Import thành công',f'Thêm {counts[0]} văn bản, {counts[1]} lịch, {counts[2]} kỳ báo cáo.\nCác bản ghi đã tồn tại được giữ nguyên.')
        except Exception as exc:messagebox.showerror('Lỗi Import',str(exc))

    def export_file(self):
        path=filedialog.asksaveasfilename(defaultextension='.xlsx',initialfile='documents.xlsx',filetypes=[('Excel','*.xlsx')])
        if not path:return
        try:
            export_excel(Path(path))
            messagebox.showinfo('Thành công',f'Đã xuất: {path}')
        except Exception as exc:messagebox.showerror('Lỗi Export',str(exc))

    def backup(self):
        try:messagebox.showinfo('Sao lưu',f'Đã sao lưu:\n{backup_db()}')
        except Exception as exc:messagebox.showerror('Lỗi sao lưu',str(exc))

    def _process_tray_commands(self):
        """Only Tk's main thread may operate Tk widgets."""
        try:
            while True:
                command = self._tray_commands.get_nowait()
                if command == 'show':
                    self.deiconify()
                    self.lift()
                    self.focus_force()
                elif command == 'alert':
                    self.startup_popup(show_empty=True)
                elif command == 'exit':
                    self.exit_application()
        except queue.Empty:
            pass
        if not self._really_exiting:
            self.after(150, self._process_tray_commands)

    def _check_scheduled_alerts(self):
        """Kiểm tra giờ địa phương trong luồng Tk, kể cả khi cửa sổ đang ẩn."""
        if self._really_exiting:
            return
        now = datetime.now()
        today = now.date().isoformat()
        current_minute = now.strftime('%H:%M')
        # Giữ trạng thái hôm nay, không tăng bộ nhớ qua nhiều ngày.
        self._alert_last_slots = {slot for slot in self._alert_last_slots
                                  if slot.startswith(today + ' ')}
        for hour in ALERT_AUTO_TIMES:
            slot = f'{today} {hour}'
            # Phát bù mốc giờ đã bỏ lỡ khi Windows thức dậy, chỉ một lần mỗi mốc.
            if current_minute >= hour and slot not in self._alert_last_slots:
                self._alert_last_slots.add(slot)
                try:
                    self.startup_popup(show_empty=False)
                except Exception as exc:
                    log_operation('scheduled_alert_failed', slot=slot, error=exc)
        self.after(15000, self._check_scheduled_alerts)

    def open_dashboard_from_alert(self, popup):
        """Đóng cảnh báo, mở cửa sổ chính tại tab TỔNG QUAN."""
        if popup.winfo_exists():
            popup.destroy()
        self.deiconify()
        self.tabs.select(self.dashboard_frame)
        self.lift()
        self.focus_force()

    def _create_tray(self):
        """Start Windows system tray icon once; callbacks enqueue main-thread actions."""
        if self._tray_icon is not None:
            return True
        try:
            import pystray
            from PIL import Image, ImageDraw
        except ImportError:
            messagebox.showerror('Thiếu thư viện khay hệ thống',
                'Cần cài: python -m pip install pystray Pillow\n'
                'Không thu nhỏ để tránh làm mất cửa sổ ứng dụng.', parent=self)
            return False
        try:
            icon_path = resource_path('80namCAND.ico')
            if icon_path.is_file():
                with Image.open(icon_path) as source:
                    tray_image = source.convert('RGBA').copy()
            else:
                tray_image = Image.new('RGBA', (64, 64), '#17365D')
                draw = ImageDraw.Draw(tray_image)
                draw.rectangle((13, 9, 51, 55), outline='white', width=4)
                draw.line((21, 23, 43, 23), fill='white', width=3)
                draw.line((21, 34, 43, 34), fill='white', width=3)

            def post(action):
                self._tray_commands.put(action)

            menu = pystray.Menu(
                pystray.MenuItem('Thông báo', lambda icon, item: post('alert')),
                pystray.MenuItem('Mở ứng dụng', lambda icon, item: post('show'), default=True),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem('Thoát', lambda icon, item: post('exit')),
            )
            tray = pystray.Icon('K02DocumentManager', tray_image,
                                'K02 Document Manager', menu)
            self._tray_icon = tray
            self._tray_thread = threading.Thread(target=tray.run, daemon=True,
                                                 name='K02-SystemTray')
            self._tray_thread.start()
            return True
        except Exception as exc:
            self._tray_icon = None
            messagebox.showerror('Lỗi khay hệ thống', str(exc), parent=self)
            return False

    def on_close(self):
        """X hides the main window, without backup or terminating the app."""
        if self._create_tray():
            self.withdraw()

    def exit_application(self):
        """Sao lưu SQLite và đồng bộ Excel trước khi thoát hẳn."""
        if self._really_exiting:
            return
        errors = []
        try:
            backup_db(on_exit=True)
        except Exception as exc:
            errors.append(f'Sao lưu SQLite: {exc}')
            log_operation('exit_db_backup_failed', error=exc)
        try:
            export_excel()
        except Exception as exc:
            errors.append(f'Xuất Excel: {exc}')
            log_operation('exit_excel_export_failed', error=exc)
        if errors:
            if not messagebox.askyesno('Không thể hoàn tất sao lưu',
                    'Có lỗi khi lưu dữ liệu trước khi thoát:\n\n' +
                    '\n'.join(errors) + '\n\nVẫn đóng phần mềm?', parent=self):
                return
        self._really_exiting = True
        tray = self._tray_icon
        self._tray_icon = None
        if tray is not None:
            try:
                tray.stop()
            except Exception as exc:
                log_operation('tray_stop_failed', error=exc)
        self.destroy()

    def open_change_history(self):
        """Tạo mới bản TXT từ SQLite và mở bằng ứng dụng mặc định."""
        try:
            path = export_change_history_txt()
            if sys.platform == 'win32':
                os.startfile(str(path))
            else:
                import subprocess
                subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(path)])
        except Exception as exc:
            messagebox.showerror('Lịch sử thay đổi',
                                 f'Không thể tạo hoặc mở file lịch sử:\n{exc}', parent=self)

    def restore_data(self):
        path = filedialog.askopenfilename(parent=self, initialdir=str(BACKUP),
            title='Chọn bản sao lưu để khôi phục',
            filetypes=[('Cơ sở dữ liệu SQLite', '*.db'), ('Tất cả file', '*.*')])
        if not path:
            return
        if not messagebox.askyesno('Xác nhận khôi phục',
                'Khôi phục sẽ THAY THẾ toàn bộ dữ liệu hiện tại bằng bản đã chọn.\n'
                'Chương trình sẽ tự sao lưu dữ liệu hiện tại trước khi khôi phục.\n\nTiếp tục?',
                icon='warning', parent=self):
            return
        try:
            safety = restore_db(path)
            init_db()
            self.report_filter_ids = None
            self.report_filter_label = ''
            self.filter_var.set('')
            self.refresh()
            try:
                export_excel()
            except Exception as excel_exc:
                log_operation('restore_excel_export_failed', error=excel_exc)
                messagebox.showwarning('Đã khôi phục SQLite',
                    f'Dữ liệu SQLite đã được khôi phục thành công.\n'
                    f'Không thể tạo lại file Excel:\n{excel_exc}\n\n'
                    f'Bản an toàn trước khôi phục:\n{safety}', parent=self)
            else:
                messagebox.showinfo('Khôi phục thành công',
                    f'Đã khôi phục SQLite và tạo lại Excel:\n{EXCEL_PATH}\n\n'
                    f'Bản an toàn trước khôi phục:\n{safety}', parent=self)
        except Exception as exc:
            messagebox.showerror('Lỗi khôi phục', str(exc), parent=self)

    def check_all_links(self):
        try:
            issues, total = broken_attachment_links()
        except Exception as exc:
            messagebox.showerror('Lỗi kiểm tra liên kết', str(exc), parent=self)
            return
        if not issues:
            messagebox.showinfo('Kiểm tra liên kết',
                f'Đã kiểm tra {total} liên kết. Không phát hiện liên kết hỏng.', parent=self)
            return
        win = tk.Toplevel(self)
        win.title(f'Liên kết không tồn tại ({len(issues)}/{total})')
        win.geometry('900x420')
        frame = ttk.Frame(win, padding=10)
        frame.pack(fill='both', expand=True)
        ttk.Label(frame, text=f'Đã kiểm tra {total} liên kết; phát hiện {len(issues)} liên kết không tìm thấy file.').pack(anchor='w', pady=(0, 8))
        cols = ('type', 'doc', 'path')
        tree = ttk.Treeview(frame, columns=cols, show='headings')
        for col, title, width in [('type','Loại',125),('doc','Số/Ký hiệu',145),('path','Đường dẫn không tồn tại',570)]:
            tree.heading(col, text=title)
            tree.column(col, width=width, stretch=(col=='path'))
        scroll = ttk.Scrollbar(frame, orient='vertical', command=tree.yview)
        tree.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right', fill='y')
        tree.pack(fill='both', expand=True)
        for item in issues:
            tree.insert('', 'end', values=item)
        ttk.Button(frame, text='Đóng', command=win.destroy).pack(anchor='e', pady=(8,0))

    def toggle_startup_setting(self):
        requested = self.startup_var.get()
        try:
            set_startup(requested)
        except Exception as exc:
            self.startup_var.set(startup_enabled())
            messagebox.showerror('Lỗi cài đặt khởi động', str(exc), parent=self)

    def startup_popup(self, show_empty=False):
        today = date.today()
        cutoff = date.fromordinal(today.toordinal() + 30).isoformat()
        alerts = [r for r in all_reports()
                  if not r['completed_date'] and r['precision'] == 'day'
                  and r['due_date'] <= cutoff]
        if not alerts:
            if show_empty:
                messagebox.showinfo('CẢNH BÁO THỜI HẠN',
                    'Không có kỳ báo cáo quá hạn hoặc đến hạn trong 30 ngày.',
                    parent=self)
            return

        # Không tạo nhiều cửa sổ cảnh báo trùng nhau.
        if self._alert_popup is not None and self._alert_popup.winfo_exists():
            self._alert_popup.lift()
            return
        popup = tk.Toplevel(self)
        self._alert_popup = popup
        popup.title('CẢNH BÁO THỜI HẠN')
        popup.geometry('470x410')   # Kích thước
        popup.minsize(430, 300)
        popup.configure(bg='#F3F6FB')
        popup.attributes('-topmost', True)
        popup.update_idletasks()
        popup.geometry(f'+{max(0, popup.winfo_screenwidth()-490)}+35')

        header = tk.Frame(popup, bg='#E8F0FC', padx=12, pady=7)
        header.pack(fill='x')
        tk.Label(header, text=f'🔔  {len(alerts)} KỲ BÁO CÁO CẦN CHÚ Ý !!',
                 font=('Verdana', 16, 'bold'), fg="#FD0202",
                 bg='#E8F0FC', anchor='w').pack(fill='x')
        tk.Label(header, text='Các kỳ quá hạn và sắp đến hạn trong 30 ngày',
                 font=('Segoe UI', 11), fg="#0D6EDD",
                 bg='#E8F0FC', anchor='w').pack(fill='x', pady=(1, 0))

        container = tk.Frame(popup, bg='#F3F6FB', padx=9, pady=7)
        container.pack(fill='both', expand=True)
        canvas = tk.Canvas(container, bg='#F3F6FB', highlightthickness=0)
        scroll = ttk.Scrollbar(container, orient='vertical', command=canvas.yview)
        canvas.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right', fill='y')
        canvas.pack(side='left', fill='both', expand=True)
        cards = tk.Frame(canvas, bg='#F3F6FB')
        window_id = canvas.create_window((0, 0), window=cards, anchor='nw')
        cards.bind('<Configure>', lambda e: canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.bind('<Configure>', lambda e: canvas.itemconfigure(window_id, width=e.width))

        for r in alerts[:40]:
            label, status = remaining_text(r['due_date'], None)
            palette = {
                'overdue': ('#FFF0F0', '#B42318'),
                'urgent': ('#FFF0E7', '#B54708'),
                'orange': ('#FFF4E5', '#A15C07'),
                'yellow': ('#FFF9E6', '#8B6914'),
            }
            bg, accent = palette.get(status, ('#F0F7FF', '#235D9F'))
            card = tk.Frame(cards, bg=bg, highlightbackground='#DEE5EF',
                            highlightthickness=1, padx=7, pady=1)
            card.pack(fill='x', pady=(0, 3), padx=(1, 3))
                    #padx=9: Khoảng đệm bên trong thẻ theo chiều ngang.
                    #pady=5: Khoảng đệm bên trong thẻ theo chiều dọc.
                    #pady=(0, 5): Khoảng cách giữa hai thẻ.
                    #padx=(1, 4): Khoảng cách hai bên ngoài thẻ.

            tk.Label(card, text=f"{r['number']}/{r['symbol']}",
                     font=('Segoe UI', ALERT_FONT_SIZE, 'bold'),
                     bg=bg, fg='#1F2937', anchor='w', pady=0).pack(fill='x') # Dòng 1: Số/Ký hiệu
            tk.Label(card, text=f"{r['kind']}   •   Hạn: {display_date(r['due_date'])}",
                     font=('Segoe UI', ALERT_FONT_SIZE), bg=bg,
                     fg='#475569', anchor='w', pady=0).pack(fill='x', pady=(0)) # Dòng 2: Loại báo cáo và thời hạn
            tk.Label(card, text=label, font=('Segoe UI', ALERT_FONT_SIZE, 'bold'),
                     bg=bg, fg=accent, anchor='w', pady=0).pack(fill='x', pady=(0)) # Dòng 3: Trạng thái

        if len(alerts) > 40:
            tk.Label(cards, text=f'Chỉ hiển thị 40/{len(alerts)} kỳ đầu tiên.',
                     bg='#F3F6FB', fg='#64748B', font=('Segoe UI', 10)).pack(pady=6)

        def scroll_alerts(event):
            canvas.yview_scroll(-int(event.delta / 120), 'units')
        # Chuột thường nằm trên Label/Frame của thẻ; gắn sự kiện cho toàn bộ con.
        def bind_wheel_recursive(widget):
            widget.bind('<MouseWheel>', scroll_alerts)
            widget.bind('<Button-4>', lambda event: canvas.yview_scroll(-1, 'units'))
            widget.bind('<Button-5>', lambda event: canvas.yview_scroll(1, 'units'))
            for child in widget.winfo_children():
                bind_wheel_recursive(child)

        bind_wheel_recursive(canvas)
        bind_wheel_recursive(cards)

        footer = tk.Frame(popup, bg='#F3F6FB', padx=10, pady=10)
        footer.pack(fill='x')
        tk.Button(footer, text='Kiểm tra',
                  command=lambda: self.open_dashboard_from_alert(popup),
                  bg='#BCE8CE', activebackground='#A2F0B5',
                  fg='#163A2C', font=('Segoe UI', 11, 'bold'),
                  relief='flat', padx=18, pady=3).pack(side='left')
        tk.Button(footer, text='Đóng', command=popup.destroy,
                  bg='#DDE7F4', activebackground='#C9D9EF',
                  fg='#243447', font=('Segoe UI', 11, 'bold'),
                  relief='flat', padx=18, pady=3).pack(side='right')
        if '--startup' in sys.argv:
            self.withdraw()
            def open_main():
                self.deiconify()
                self.lift()
            tk.Button(footer, text='Mở quản lý', command=open_main,
                      bg='#BCE8CE', activebackground='#A2F0B5',
                      font=('Segoe UI', 11, 'bold'), relief='flat',
                      padx=16, pady=6).pack(side='right', padx=(0, 8))


def main():
    init_db()
    app=App()
    # Dong PyInstaller splash sau khi giao dien Tkinter da khoi tao.
    # Khi chay file .py truc tiep, module pyi_splash khong ton tai.
    app.update_idletasks()
    try:
        import pyi_splash
        pyi_splash.close()
    except (ImportError, RuntimeError, OSError):
        pass
    app.mainloop()


if __name__=='__main__':
    main()
