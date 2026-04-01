'use client'

export default function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] animate-in fade-in duration-300">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
    </div>
  )
}
