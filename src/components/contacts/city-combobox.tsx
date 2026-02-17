'use client'

import * as React from 'react'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { colombiaCities } from '@/lib/data/colombia-cities'

interface CityComboboxProps {
  value: string
  onChange: (value: string) => void
  onDepartmentChange?: (department: string) => void
  name?: string
  id?: string
  disabled?: boolean
  error?: string
}

export function CityCombobox({
  value,
  onChange,
  onDepartmentChange,
  id = 'city',
  disabled = false,
  error,
}: CityComboboxProps) {
  const [search, setSearch] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [highlightedIndex, setHighlightedIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  // Find selected city for display
  const selectedCity = React.useMemo(() => {
    return colombiaCities.find((city) => city.value === value)
  }, [value])

  // Display value: show selected city or search text
  const displayValue = React.useMemo(() => {
    if (search) return search
    if (selectedCity) return `${selectedCity.label} - ${selectedCity.department}`
    return ''
  }, [search, selectedCity])

  // Filter cities based on search query (only when there's search text)
  const filteredCities = React.useMemo(() => {
    if (!search.trim()) {
      return []
    }

    const normalized = search.toLowerCase().trim()
    return colombiaCities
      .filter(
        (city) =>
          city.label.toLowerCase().includes(normalized) ||
          city.department.toLowerCase().includes(normalized)
      )
      .slice(0, 50)
  }, [search])

  // Reset highlighted index when filtered results change
  React.useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredCities])

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setSearch(newValue)
    setOpen(newValue.length > 0)
    // Clear selection when user starts typing
    if (value && newValue !== displayValue) {
      onChange('')
    }
  }

  // Handle focus
  const handleFocus = () => {
    if (search.length > 0) {
      setOpen(true)
    }
  }

  // Handle blur
  const handleBlur = (e: React.FocusEvent) => {
    // Delay to allow click on list item
    setTimeout(() => {
      setOpen(false)
      // If no selection and there's search text, clear it
      if (!value && search) {
        setSearch('')
      }
    }, 150)
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || filteredCities.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredCities.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredCities[highlightedIndex]) {
          selectCity(filteredCities[highlightedIndex].value)
        }
        break
      case 'Escape':
        setOpen(false)
        break
    }
  }

  // Select a city
  const selectCity = (cityValue: string) => {
    const city = colombiaCities.find((c) => c.value === cityValue)
    if (city) {
      onChange(cityValue)
      onDepartmentChange?.(city.department)
      setSearch('')
      setOpen(false)
    }
  }

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (open && listRef.current) {
      const highlightedItem = listRef.current.children[highlightedIndex] as HTMLElement
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, open])

  return (
    <div className="space-y-2 relative">
      <Label htmlFor={id}>Ciudad</Label>
      <Input
        ref={inputRef}
        id={id}
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Escribe para buscar ciudad..."
        autoComplete="off"
        className={cn(error && 'border-destructive')}
      />

      {/* Dropdown list - always below */}
      {open && filteredCities.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-auto rounded-md border bg-popover shadow-md"
        >
          {filteredCities.map((city, index) => (
            <div
              key={city.value}
              className={cn(
                'flex items-center px-3 py-2 cursor-pointer text-sm',
                index === highlightedIndex && 'bg-accent',
                value === city.value && 'font-medium'
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                selectCity(city.value)
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <CheckIcon
                className={cn(
                  'mr-2 h-4 w-4',
                  value === city.value ? 'opacity-100' : 'opacity-0'
                )}
              />
              <span>{city.label}</span>
              <span className="ml-auto text-muted-foreground text-xs">
                {city.department}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
