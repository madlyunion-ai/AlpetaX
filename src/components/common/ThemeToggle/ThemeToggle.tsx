import { useTheme } from '@/hooks/useTheme'
import Icon from '@/components/common/Icon/Icon'
import './ThemeToggle.scss'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="theme-toggle" data-value={theme}>
      <label className="theme-toggle-option">
        <input
          type="radio"
          name="theme"
          value="light"
          className="sr-only"
          checked={theme === 'light'}
          onChange={() => setTheme('light')}
        />
        <Icon name="light" />
      </label>

      <label className="theme-toggle-option">
        <input
          type="radio"
          name="theme"
          value="dark"
          className="sr-only"
          checked={theme === 'dark'}
          onChange={() => setTheme('dark')}
        />
        <Icon name="dark" />
      </label>
    </div>
  )
}

export default ThemeToggle
