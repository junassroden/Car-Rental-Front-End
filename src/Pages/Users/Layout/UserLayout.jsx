import { useTheme } from '../Components/theme.js'

export default function UserLayout({ sidebar, topbar, notifications, navOpen, onCloseNavigation, children }) {
	const theme = useTheme()
	return (
		<div className="app-frame customer-frame" data-theme={theme}>
			{navOpen && <button className="nav-drawer-backdrop" type="button" aria-label="Close navigation" onClick={onCloseNavigation} />}
			{sidebar}
			<div className="app-main">
				{topbar}
				{notifications}
				<main>{children}</main>
			</div>
		</div>
	)
}
