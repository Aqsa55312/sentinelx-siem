// Package main: file-upload parsing for JSON Lines (.jsonl) and JSON arrays (.json).
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

const maxUploadEvents = 5000

// parseUploadFile reads a .jsonl (one object per line) or .json (array of objects)
// payload and returns raw event maps plus the count of lines that failed to parse.
// Invalid lines are counted, never silently merged.
func parseUploadFile(r io.Reader, filename string) (raw []map[string]any, rejectedParse int, err error) {
	lower := strings.ToLower(filename)
	if strings.HasSuffix(lower, ".json") && !strings.HasSuffix(lower, ".jsonl") {
		return parseJSONArray(r)
	}
	return parseJSONLines(r)
}

func parseJSONLines(r io.Reader) ([]map[string]any, int, error) {
	var out []map[string]any
	rejected := 0
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB per line max
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		if len(out) >= maxUploadEvents {
			return nil, rejected, fmt.Errorf("too many events (max %d per file)", maxUploadEvents)
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			rejected++
			continue
		}
		out = append(out, m)
	}
	if err := sc.Err(); err != nil {
		return nil, rejected, fmt.Errorf("unreadable upload: %v", err)
	}
	return out, rejected, nil
}

func parseJSONArray(r io.Reader) ([]map[string]any, int, error) {
	var arr []map[string]any
	if err := json.NewDecoder(r).Decode(&arr); err != nil {
		return nil, 0, fmt.Errorf("invalid JSON array: file must contain [{...}, {...}]")
	}
	if len(arr) > maxUploadEvents {
		return nil, 0, fmt.Errorf("too many events (max %d per file)", maxUploadEvents)
	}
	return arr, 0, nil
}
