---
inclusion: auto
---

# UI Component Standards

Use these Tailwind-based components for all new UI work. They are themed for dark mode with orange accents.

- **Button**: `import { Button } from '@/components/button'` — variants: `solid` (default), `outline`, `ghost`, `danger`; sizes: `xs`, `sm`, `md`, `lg`; also accepts `outline` boolean prop.
- **Badge**: `import { Badge } from '@/components/badge'` — colors: `orange`, `lime`, `purple`, `rose`, `red`, `green`, `blue`, `yellow`, `gray`.
- **Dropdown**: `import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from '@/components/dropdown'` — built on Headless UI `Menu`. `DropdownButton` accepts `outline` prop. `DropdownItem` accepts `href` or `onClick`.
- **Input**: `import { Input } from '@/components/input'` — drop-in replacement for `<input>`.
- **Fieldset**: `import { Field, Label, Fieldset, Legend } from '@/components/fieldset'` — form layout primitives.
- **Pagination**: `import { Pagination, PaginationPrevious, PaginationNext, PaginationList, PaginationPage, PaginationGap } from '@/components/pagination'` — `PaginationPage` accepts `current` boolean.

Prefer these over raw DaisyUI `btn`/`badge`/`input` classes in new code.
