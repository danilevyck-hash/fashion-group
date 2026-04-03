export function SkeletonRow() {
  return (
    <div className="animate-pulse flex gap-4 py-3 border-b border-gray-200">
      <div className="h-3 bg-gray-100 rounded w-1/3" />
      <div className="h-3 bg-gray-100 rounded w-1/5 ml-auto" />
      <div className="h-3 bg-gray-100 rounded w-1/5" />
      <div className="h-3 bg-gray-100 rounded w-1/6" />
    </div>
  );
}

export function SkeletonBlock() {
  return <div className="animate-pulse h-3 bg-gray-100 rounded w-full mb-2" />;
}
