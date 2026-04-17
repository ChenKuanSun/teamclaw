import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { AdminApiService } from '../../services/admin-api.service';

interface SkillEntry {
  skillId: string;
  name: string;
  emoji: string;
  description: string;
  integrationId: string;
  source: 'bundled' | 'upstream';
  homepage?: string;
}

interface SkillView extends SkillEntry {
  enabled: boolean;
  hasCredentials: boolean;
}

const SKILL_CATALOG: SkillEntry[] = [
  {
    skillId: 'notion',
    name: 'Notion',
    emoji: '\u{1F4DD}',
    description: 'Read and write Notion pages and databases',
    integrationId: 'notion',
    source: 'upstream',
    homepage: 'https://developers.notion.com',
  },
  {
    skillId: 'slack',
    name: 'Slack',
    emoji: '\u{1F4AC}',
    description: 'Send messages and interact with Slack workspaces',
    integrationId: 'slack',
    source: 'upstream',
  },
  {
    skillId: 'github',
    name: 'GitHub',
    emoji: '\u{1F419}',
    description: 'Access repositories, issues, and pull requests',
    integrationId: 'github',
    source: 'upstream',
  },
  {
    skillId: 'jira',
    name: 'Jira',
    emoji: '\u{1F536}',
    description: 'Create, search, and manage Jira issues and sprints',
    integrationId: 'jira',
    source: 'bundled',
    homepage:
      'https://developer.atlassian.com/cloud/jira/platform/rest/v3/',
  },
  {
    skillId: 'confluence',
    name: 'Confluence',
    emoji: '\u{1F4C4}',
    description: 'Search, read, and create Confluence pages',
    integrationId: 'confluence',
    source: 'bundled',
    homepage:
      'https://developer.atlassian.com/cloud/confluence/rest/v2/',
  },
  {
    skillId: 'linear',
    name: 'Linear',
    emoji: '\u{1F7E3}',
    description: 'Create and manage Linear issues and projects',
    integrationId: 'linear',
    source: 'bundled',
    homepage: 'https://developers.linear.app',
  },
];

@Component({
  selector: 'tc-skills',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
  templateUrl: './skills.component.html',
  styleUrl: './skills.component.scss',
})
export class SkillsComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly skills = signal<SkillView[]>([]);
  readonly loading = signal(false);
  readonly displayedColumns = [
    'emoji',
    'name',
    'description',
    'source',
    'status',
    'actions',
  ];

  ngOnInit(): void {
    this.loadSkills();
  }

  loadSkills(): void {
    this.loading.set(true);
    this.adminApi
      .listIntegrations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          const integrationMap = new Map(
            res.integrations.map(i => [i.integrationId, i]),
          );
          const views: SkillView[] = SKILL_CATALOG.map(skill => {
            const integration = integrationMap.get(skill.integrationId);
            return {
              ...skill,
              enabled: integration?.enabled ?? false,
              hasCredentials: integration?.hasCredentials ?? false,
            };
          });
          this.skills.set(views);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  openIntegration(skill: SkillView): void {
    this.router.navigate(['/integrations', skill.integrationId]);
  }
}
