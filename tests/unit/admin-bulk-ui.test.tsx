import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BulkActions } from '../../src/admin/BulkActions'
import { CodeListFilters, VideoListFilters } from '../../src/admin/ListFilters'
import {
  emptyCodeFilters,
  emptyVideoFilters,
} from '../../src/core/admin-management'

describe('admin bulk UI', () => {
  it('renders confirmed video filters without selected IDs or offset', () => {
    const html = renderToStaticMarkup(
      <VideoListFilters
        action="/admin/videos"
        filters={{
          ...emptyVideoFilters,
          q: 'Title_%',
          status: 'published',
          offset: 100,
        }}
      />,
    )
    expect(html).toContain('name="q"')
    expect(html).toContain('value="Title_%"')
    expect(html).toContain('value="published" selected=""')
    expect(html).not.toContain('name="offset"')
    expect(html).not.toContain('name="ids"')
  })

  it('keeps video return filters distinct from code filters', () => {
    const html = renderToStaticMarkup(
      <CodeListFilters
        action="/admin/videos/video-a/codes"
        resetHref="/admin/videos/video-a/codes?q=video&offset=100"
        videoFilters={{ ...emptyVideoFilters, q: 'video', offset: 100 }}
        filters={{ ...emptyCodeFilters, setting: 'disabled', offset: 200 }}
      />,
    )
    expect(html).toContain('name="q" value="video"')
    expect(html).toContain('name="offset" value="100"')
    expect(html).toContain('name="setting"')
    expect(html).not.toContain('name="codesOffset"')
  })

  it('announces selection and disables duplicate bulk submission', () => {
    const html = renderToStaticMarkup(
      <BulkActions kind="codes" selectedCount={3} busy onTarget={() => {}} />,
    )
    expect(html).toContain('3件を選択中')
    expect(html).toContain('disabled=""')
    expect(html).toContain('有効にする')
    expect(html).toContain('無効にする')
    expect(html).toContain('付与済みの視聴権は消しません')
  })

  it('can block only key re-enablement after the video period ends', () => {
    const html = renderToStaticMarkup(
      <BulkActions
        kind="codes"
        selectedCount={1}
        busy={false}
        enableDisabled
        onTarget={() => {}}
      />,
    )
    expect(html).toContain(
      '<button type="button" disabled="">有効にする</button>',
    )
    expect(html).toContain(
      '<button type="button" class="secondary">無効にする</button>',
    )
  })
})
