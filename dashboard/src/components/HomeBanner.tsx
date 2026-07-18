export function HomeBanner() {
  return (
    <div className="mb-8 flex items-center gap-6 overflow-hidden rounded-md border border-border bg-gradient-to-br from-primary to-secondary p-8 text-primary-foreground">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold">Theo dõi sức khỏe pin theo thời gian thực</h1>
        <p className="mt-2 text-sm text-primary-foreground/90">
          Mỗi lần đo tự động tính nội trở (Rint), so sánh với baseline của từng thiết bị, và cảnh báo sớm
          khi pin bắt đầu suy giảm — trước khi nó thực sự hỏng.
        </p>
      </div>

      {/* Illustration: battery outline with a health/pulse trace and IoT connectivity dots */}
      <svg
        aria-hidden="true"
        viewBox="0 0 400 200"
        className="hidden h-32 w-64 shrink-0 opacity-90 sm:block"
      >
        <g stroke="currentColor" strokeOpacity="0.35" strokeWidth="1">
          <circle cx="40" cy="30" r="2" fill="currentColor" fillOpacity="0.5" />
          <circle cx="90" cy="15" r="2" fill="currentColor" fillOpacity="0.5" />
          <circle cx="370" cy="170" r="2" fill="currentColor" fillOpacity="0.5" />
          <circle cx="330" cy="185" r="2" fill="currentColor" fillOpacity="0.5" />
          <line x1="40" y1="30" x2="90" y2="15" />
          <line x1="330" y1="185" x2="370" y2="170" />
        </g>

        <rect x="140" y="55" width="170" height="90" rx="12" fill="none" stroke="currentColor" strokeOpacity="0.9" strokeWidth="4" />
        <rect x="308" y="85" width="14" height="30" rx="4" fill="currentColor" fillOpacity="0.9" />

        <path
          d="M150 100 H190 L205 70 L225 130 L240 100 H300"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
