const RunIcon = ({
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

	const d =
		"M4.745 3.064A.5.5 0 0 0 4 3.5v9a.5.5 0 0 0 .745.436l8-4.5a.5.5 0 0 0 0-.872zM3 3.5a1.5 1.5 0 0 1 2.235-1.307l8 4.5a1.5 1.5 0 0 1 0 2.615l-8 4.5A1.5 1.5 0 0 1 3 12.5z";

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

export default RunIcon;
