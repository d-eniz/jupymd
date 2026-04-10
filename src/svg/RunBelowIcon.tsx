const RunBelowIcon = ({
	size = 24,
	color = "currentColor",
	strokeWidth = 0.2,
	background = "transparent",
	opacity = 1,
	rotation = 0,
	shadow = 0,
	flipHorizontal = false,
	flipVertical = false,
	padding = 0,
	className = "",
}) => {
	const transforms = [];
	if (rotation !== 0) transforms.push(`rotate(${rotation}deg)`);
	if (flipHorizontal) transforms.push("scaleX(-1)");
	if (flipVertical) transforms.push("scaleY(-1)");

	const viewBoxSize = 16 + padding * 2;
	const viewBoxOffset = -padding;
	const viewBox = `${viewBoxOffset} ${viewBoxOffset} ${viewBoxSize} ${viewBoxSize}`;

	const d = "M16 13.5a.48.48 0 0 1-.15.35l-2 2a.5.5 0 0 1-.349.15a.48.48 0 0 1-.35-.15l-2-2a.484.484 0 0 1 0-.7a.484.484 0 0 1 .699 0L13 14.29V9.5a.5.5 0 1 1 1 0v4.79l1.15-1.14a.484.484 0 0 1 .699 0a.48.48 0 0 1 .15.35zm-4-4.645l-7.255 4.081A.5.5 0 0 1 4 12.5v-9a.5.5 0 0 1 .745-.436l8 4.5c.17.096.255.266.255.436h1c0-.51-.255-1.021-.765-1.307l-8-4.5A1.5 1.5 0 0 0 3 3.5v9a1.5 1.5 0 0 0 2.235 1.307L12 10.002z";

	return (
		<svg
			className={className}
			xmlns="http://www.w3.org/2000/svg"
			viewBox={viewBox}
			width={size}
			height={size}
			style={{
				opacity,
				transform: transforms.join(" ") || undefined,
				filter:
					shadow > 0
						? `drop-shadow(0 ${shadow}px ${shadow * 2}px rgba(0,0,0,0.3))`
						: undefined,
				backgroundColor:
					background !== "transparent" ? background : undefined,
			}}
		>
			<path d={d} fill={color} />
			{strokeWidth > 0 && (
				<path
					d={d}
					fill="none"
					stroke={color}
					strokeWidth={strokeWidth}
					strokeLinejoin="round"
				/>
			)}
		</svg>
	);
};

export default RunBelowIcon;