import React from 'react'
import type { WhiteboardCursorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'

type Props = {
  cursor: WhiteboardCursorPresence
}

export function TeamWhiteboardCursor({ cursor }: Props): React.JSX.Element {
  return (
    <div
      data-testid={`remote-cursor-${cursor.userId}`}
      className="absolute pointer-events-none z-50 transition-transform duration-75 ease-out select-none"
      style={{
        transform: `translate(${cursor.x}px, ${cursor.y}px)`
      }}
    >
      {/* SVG Cursor Pointer */}
      <svg
        className="w-4 h-4 drop-shadow-xs"
        viewBox="0 0 24 24"
        fill={cursor.color}
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="3 3 10 21 14 14 21 10 3 3" />
      </svg>

      {/* Collaborator Name Pill */}
      <div
        className="mt-1 ml-3 px-2 py-0.5 rounded-full text-3xs font-medium text-white shadow-xs whitespace-nowrap"
        style={{ backgroundColor: cursor.color }}
      >
        {cursor.displayName}
      </div>
    </div>
  )
}
