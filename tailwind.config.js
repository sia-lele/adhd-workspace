/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 暖白 / 浅米白背景
        canvas: '#FBF8F3',
        surface: '#FFFFFF',
        // 深灰文字
        ink: '#44423D',
        'ink-soft': '#6B6760',
        'ink-faint': '#9C988F',
        // 柔和灰描边（未完成圆圈）
        stroke: '#D8D3C9',
        'stroke-strong': '#C2BCB0',
        // 鼠尾草绿（完成）
        sage: '#8FAE9B',
        'sage-soft': '#E4EEE7',
        'sage-deep': '#6E937C',
        // 浅薰衣草 / 柔蓝（选中）
        lilac: '#CFC9E8',
        'lilac-soft': '#EDEAF7',
        // 低饱和蓝绿（主按钮）
        teal: '#6FA59B',
        'teal-deep': '#557F77',
        'teal-soft': '#E6F0EE',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        soft: '0 4px 20px -8px rgba(80, 75, 65, 0.18)',
        card: '0 2px 10px -4px rgba(80, 75, 65, 0.15)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-in': 'slide-in 180ms ease-out',
      },
    },
  },
  plugins: [],
}
