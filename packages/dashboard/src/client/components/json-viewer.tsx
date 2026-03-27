interface JsonViewerProps {
  data: string;
  maxHeight?: string;
}

export function JsonViewer({ data, maxHeight = '20rem' }: JsonViewerProps) {
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    formatted = data;
  }

  return (
    <pre
      className="text-xs text-gray-300 font-mono bg-gray-950/50 rounded p-3 overflow-auto"
      style={{ maxHeight }}
    >
      {formatted}
    </pre>
  );
}
