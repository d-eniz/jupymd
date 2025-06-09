import * as React from "react";
import {useEffect, useRef} from "react";
import {highlightElement} from "prismjs";
import "prismjs/components/prism-python";

interface HighlightedCodeBlockProps {
    code: string;
}

export const HighlightedCodeBlock: React.FC<HighlightedCodeBlockProps> = ({code}) => {
    const codeRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (codeRef.current) {
            highlightElement(codeRef.current);
        }
    }, [code]);

    return (
        <pre className="language-python">
            <code ref={codeRef} className="language-python">
                {code}
            </code>
        </pre>
    );
};
