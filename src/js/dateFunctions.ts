function getPrettyDate(
	date: Date = new Date(),
	prefomattedDate: false | string = false,
	hideYear: boolean = false,
): string {
	const months = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	];
	const days = [
		'Sunday',
		'Monday',
		'Tuesday',
		'Wednesday',
		'Thursday',
		'Friday',
		'Saturday',
	];
	const day = String(date.getDate());
	const prettyDay = `${days[date.getDay()]} ${day}${day === '1' || day === '21' || day === '31' ? 'st' : day === '2' || day === '22' ? 'nd' : day === '3' || day === '23' ? 'rd' : 'th'}`;
	const month = months[date.getMonth()];
	const year = date.getFullYear();
	const time = String(
		date.toLocaleTimeString('en-GB', {
			hour: 'numeric',
			minute: 'numeric',
			hour12: true,
			hourCycle: 'h12',
		}),
	).replace(/\s+/g, '');
	const formattedTime = `${time.split(':')[0] === '0' ? `12:${time.split(':')[1]}` : time}`;
	if (prefomattedDate) {
		// Today at 10:20am
		// Yesterday at 10:20am
		return `${prefomattedDate} at ${formattedTime}`;
	}
	if (hideYear) {
		// Tuesday 1st August at 10:20am
		return `${prettyDay} ${month} at ${formattedTime}`;
	}
	// Tuesday 1st August 2023 at 10:20am
	return `${prettyDay} ${month} ${year} at ${formattedTime}`;
}

export function getTimeAgo(dateParam: Date | string): string | null {
	if (!dateParam) {
		return null;
	}
	const date = typeof dateParam === 'object' ? dateParam : new Date(dateParam);
	const today = new Date();
	const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
	const seconds = Math.round((today.getTime() - date.getTime()) / 1000);
	const minutes = Math.round(seconds / 60);
	const isToday = today.toDateString() === date.toDateString();
	const isYesterday = yesterday.toDateString() === date.toDateString();
	const isThisYear = today.getFullYear() === date.getFullYear();
	if (seconds < 5) {
		return 'now';
	} else if (seconds < 60) {
		return `${seconds} seconds ago`;
	} else if (seconds < 90) {
		return 'about a minute ago';
	} else if (minutes < 60) {
		return `${minutes} minutes ago`;
	} else if (isToday) {
		return getPrettyDate(date, 'Today');
	} else if (isYesterday) {
		return getPrettyDate(date, 'Yesterday');
	} else if (isThisYear) {
		return getPrettyDate(date, false, true);
	}
	return getPrettyDate(date);
}
