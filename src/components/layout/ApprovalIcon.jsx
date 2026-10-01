export default function ApprovalIcon({ className = '', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M6.5 7h7M6.5 10h7M8.5 7c5 0 5 6-2 6l5 5" />
      <path d="m14 14 2 2 3-4" />
    </svg>
  )
}
