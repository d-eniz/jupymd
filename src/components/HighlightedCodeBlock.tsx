import * as React from "react";
import {useEffect, useRef} from "react";
import {highlightElement} from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-julia";
import "prismjs/components/prism-r";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-rust";

interface HighlightedCodeBlockProps {
    code: string;
	language?: string;
}

export const HighlightedCodeBlock: React.FC<HighlightedCodeBlockProps> = ({code, language = "python"}) => {
    const codeRef = useRef<HTMLElement>(null);

    useEffect(() => {
		try {
			if (codeRef.current) highlightElement(codeRef.current);
		} catch {
			// Prism falls back to plain code when a language grammar is unavailable.
		}
    }, [code, language]);

    return (
		<pre className={`language-${language}`}>
			<code ref={codeRef} className={`language-${language}`}>
                {code}
            </code>
        </pre>
    );
};
