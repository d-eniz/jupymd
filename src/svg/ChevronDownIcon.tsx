const ChevronDownIcon = ({
	size = 24,
	color = "currentColor",
	strokeWidth = 0.8,
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

	const viewBoxSize = 16 + padding * 2; // 👈 correct scale
	const viewBoxOffset = -padding;
	const viewBox = `${viewBoxOffset} ${viewBoxOffset} ${viewBoxSize} ${viewBoxSize}`;

	const d =
		"M3.146 5.646a.5.5 0 0 1 .708 0L8 9.793l4.146-4.147a.5.5 0 0 1 .708.708l-4.5 4.5a.5.5 0 0 1-.708 0l-4.5-4.5a.5.5 0 0 1 0-.708";

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
			{/* Fill */}
			<path d={d} fill={color} />

			{/* Optional stroke (thickness control) */}
			{strokeWidth > 0 && (
				<path
					d={d}
					fill="none"
					stroke={color}
					strokeWidth={strokeWidth}
					strokeLinejoin="round"
					strokeLinecap="round"
				/>
			)}
		</svg>
	);
};

export default ChevronDownIcon;