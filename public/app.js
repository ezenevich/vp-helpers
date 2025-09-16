const tableElement = document.getElementById('task-table');
const tableHead = tableElement.querySelector('thead');
const tableBody = tableElement.querySelector('tbody');
const statusElement = document.getElementById('status');
const loadingElement = document.getElementById('loading');
const refreshButton = document.getElementById('refresh');

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit'
});

let tableData = null;

function formatToday() {
  return dateFormatter.format(new Date());
}

function setStatus(message = '', type) {
  statusElement.textContent = message;
  statusElement.classList.remove('status--success', 'status--error');
  if (type) {
    statusElement.classList.add(`status--${type}`);
  }
}

async function persistValue(rowId, columnKey, value) {
  const response = await fetch(
    `/api/rows/${encodeURIComponent(rowId)}/columns/${encodeURIComponent(columnKey)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    }
  );

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = {};
    }
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Не удалось сохранить изменения');
  }

  if (payload.row && tableData) {
    const row = tableData.rows.find(item => item.id === rowId);
    if (row) {
      row[columnKey] = payload.row[columnKey];
    }
  }

  return payload;
}

async function handleCheckboxChange({ checkbox, dateElement, rowId, columnKey }) {
  const previousValue = dateElement.textContent;
  const previousChecked = Boolean(previousValue);
  const desiredChecked = checkbox.checked;
  const newValue = desiredChecked ? formatToday() : '';

  dateElement.textContent = newValue;
  checkbox.disabled = true;

  try {
    await persistValue(rowId, columnKey, newValue);
    setStatus('Изменения сохранены', 'success');
  } catch (error) {
    dateElement.textContent = previousValue;
    checkbox.checked = previousChecked;
    setStatus(error.message, 'error');
  } finally {
    checkbox.disabled = false;
  }
}

function renderTable(data) {
  const { columns, rows } = data;

  tableHead.innerHTML = '';
  const headRow = document.createElement('tr');
  columns.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column.label;
    headRow.append(th);
  });
  tableHead.append(headRow);

  tableBody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');

    columns.forEach(column => {
      const td = document.createElement('td');
      td.dataset.type = column.type;
      td.dataset.key = column.key;

      if (column.type === 'text') {
        const value = row[column.key];
        if (column.key === 'name') {
          td.textContent = value || '';
        } else if (value) {
          td.textContent = value;
        } else {
          td.textContent = '—';
          td.classList.add('is-empty');
        }
      } else if (column.type === 'checkbox') {
        const wrapper = document.createElement('div');
        wrapper.className = 'checkbox-cell';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(row[column.key]);
        checkbox.dataset.rowId = row.id;
        checkbox.dataset.columnKey = column.key;
        checkbox.setAttribute('aria-label', `${row.name}: ${column.label}`);

        const dateElement = document.createElement('span');
        dateElement.className = 'task-table__date';
        dateElement.textContent = row[column.key] || '';

        checkbox.addEventListener('change', () =>
          handleCheckboxChange({ checkbox, dateElement, rowId: row.id, columnKey: column.key })
        );

        wrapper.append(checkbox, dateElement);
        td.append(wrapper);
      } else {
        td.textContent = row[column.key] ?? '';
      }

      tr.append(td);
    });

    tableBody.append(tr);
  });
}

async function fetchData({ showSuccess = false } = {}) {
  try {
    loadingElement.hidden = false;
    refreshButton.disabled = true;
    const response = await fetch('/api/data', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Не удалось загрузить данные');
    }
    const data = await response.json();
    tableData = data;
    renderTable(data);
    setStatus(showSuccess ? 'Данные обновлены' : '');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    loadingElement.hidden = true;
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', () => fetchData({ showSuccess: true }));

fetchData();
