/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./app/**/*.{js,ts,jsx,tsx,mdx}",
		"./components/**/*.{js,ts,jsx,tsx,mdx}",
	],
	darkMode: ['class', "class"],
	theme: {
		extend: {
			fontFamily: {
				sans: [
					'var(--fn)'
				],
				mono: [
					'var(--fm)'
				]
			},
			colors: {
				bg: 'var(--bg)',
				surface: 'var(--surface)',
				surface2: 'var(--surface2)',
				surface3: 'var(--surface3)',
				border: 'hsl(var(--border))',
				border2: 'var(--border2)',
				text: 'var(--text)',
				text2: 'var(--text2)',
				text3: 'var(--text3)',
				pill: 'var(--pill)',
				'pill-t': 'var(--pill-t)',
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				'accent-s': 'var(--accent-s)',
				'accent-r': 'var(--accent-r)',
				green: 'var(--green)',
				'green-bg': 'var(--green-bg)',
				'green-br': 'var(--green-br)',
				red: 'var(--red)',
				'red-bg': 'var(--red-bg)',
				'red-br': 'var(--red-br)',
				yellow: 'var(--yellow)',
				'yellow-bg': 'var(--yellow-bg)',
				blue: 'var(--blue)',
				'blue-bg': 'var(--blue-bg)',
				orange: 'var(--orange)',
				'orange-bg': 'var(--orange-bg)',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))'
				}
			},
			backgroundImage: {
				'bg-grad': 'var(--bg-grad)'
			},
			boxShadow: {
				s0: 'var(--s0)',
				s1: 'var(--s1)',
				s2: 'var(--s2)',
				s3: 'var(--s3)',
				s4: 'var(--s4)'
			},
			borderRadius: {
				r1: 'var(--r1)',
				r2: 'var(--r2)',
				r3: 'var(--r3)',
				r4: 'var(--r4)',
				r5: 'var(--r5)',
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			spacing: {
				'sidebar-w': 'var(--sidebar-w)',
				'topbar-h': 'var(--topbar-h)',
				'safe': 'env(safe-area-inset-bottom)',
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
}
