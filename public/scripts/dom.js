export function setText(node, value) {
  if (!node) {
    return;
  }

  node.textContent = value == null ? "" : String(value);
}

export function setStatusText(node, value) {
  if (!node) {
    return;
  }

  const text = value == null ? "" : String(value);
  setText(node, text);
  node.dataset.state = text.toLowerCase().replace(/\s+/g, "-");
}

export function renderStatusRows(rows, valueNodes) {
  for (const row of rows) {
    setStatusText(valueNodes[row.id], row.value);
  }
}
