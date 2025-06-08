export const LoadIcon = ({className = ""}) => (
	<>
		<style>
			{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes spin2 {
          0% {
            stroke-dasharray: 1, 64;
            stroke-dashoffset: 0;
          }
          50% {
            stroke-dasharray: 32, 32;
            stroke-dashoffset: -16;
          }
          100% {
            stroke-dasharray: 64, 1;
            stroke-dashoffset: -64;
          }
        }

        .spin2 {
          transform-origin: center;
          animation: spin2 2s ease-in-out infinite,
                     spin 3.5s linear infinite;
          animation-direction: alternate;
        }
      `}
		</style>
		<svg
			className={className}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle
				className="spin2"
				cx="12"
				cy="12"
				r="10"
				fill="none"
			/>
		</svg>
	</>
);
