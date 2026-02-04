# GitHub PR Review Skill

Repository: {{REPO_NAME}}
Owner: {{OWNER}}

{{#if vendor == "github"}}

## GitHub Copilot Guidelines

Use GitHub-specific conventions for PR review.
{{else}}

## Generic Guidelines

Use standard PR review conventions.
{{/if}}

## Review Checklist

{{#each CHECKLIST_ITEMS}}

- {{this}}
  {{/each}}
