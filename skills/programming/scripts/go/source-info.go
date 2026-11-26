// Read-only package and physical code-line information for check-no-excuse-rules.sh.
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/scanner"
	"go/token"
	"os"
	"strings"
)

func inspect(path string) (string, error) {
	src, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	header, err := parser.ParseFile(token.NewFileSet(), path, src, parser.PackageClauseOnly|parser.ParseComments)
	if err != nil {
		return "", err
	}
	if ast.IsGenerated(header) {
		return "generated", nil
	}

	file := token.NewFileSet().AddFile(path, -1, len(src))
	var lexer scanner.Scanner
	var scanErrors scanner.ErrorList
	lexer.Init(file, src, scanErrors.Add, scanner.ScanComments)
	pureLOC, lastLine := 0, 0
	sizeOK := false
	for {
		pos, tok, text := lexer.Scan()
		if tok == token.EOF {
			break
		}
		if tok == token.COMMENT {
			if reason, ok := strings.CutPrefix(text, "// allow: SIZE_OK —"); ok && strings.TrimSpace(reason) != "" {
				sizeOK = true
			}
			continue
		}
		if tok == token.SEMICOLON && text == "\n" {
			continue // inserted semicolon, not source text
		}
		line := file.PositionFor(pos, false).Line // physical lines, not //line mappings
		if line > lastLine {
			pureLOC++
		}
		lastLine = line
		if tok == token.STRING && strings.HasPrefix(text, "`") {
			for _, continuation := range strings.Split(text, "\n")[1:] {
				if strings.TrimSpace(continuation) != "" {
					pureLOC++
				}
				lastLine++
			}
		}
	}
	if err := scanErrors.Err(); err != nil {
		return "", err
	}
	return fmt.Sprintf("%t %d %t", header.Name.Name == "main", pureLOC, sizeOK), nil
}

func main() {
	for _, path := range os.Args[2:] { // skip the -- after the go run source path
		info, err := inspect(path)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Println(info)
	}
}
