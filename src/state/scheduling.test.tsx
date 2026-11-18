import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../data/memoryRepository';
import { createMemoryScheduling } from '../data/scheduling';
import { DataProvider, useData } from './DataProvider';
import { SchedulingContext, useScheduling } from './scheduling';

function store() {
  return createMemoryScheduling({
    members: () => [
      { userId: 'me', name: 'Me' },
      { userId: 'them', name: 'Them' },
    ],
    requests: () => [{ from: 'me', to: 'them', status: 'accepted', createdAt: new Date(0).toISOString() }],
    blocks: () => [],
  });
}

function Probe() {
  const scheduling = useScheduling();
  const { mode, enterDemo, exitDemo } = useData();
  return (
    <div>
      <span>mode: {mode}</span>
      <span>scheduling: {scheduling ? 'offered' : 'not offered'}</span>
      <button onClick={() => void enterDemo()}>Try demo</button>
      <button onClick={() => exitDemo()}>Leave demo</button>
    </div>
  );
}

describe('scheduling in demo mode', () => {
  it('is offered with your own data and not offered in demo mode, where nothing is stored', async () => {
    const user = userEvent.setup();
    const scheduling = store();
    render(
      <DataProvider repository={createMemoryRepository()}>
        <SchedulingContext.Provider value={scheduling.as('me')}>
          <Probe />
        </SchedulingContext.Provider>
      </DataProvider>,
    );
    await screen.findByText('scheduling: offered');

    await user.click(screen.getByRole('button', { name: 'Try demo' }));
    await waitFor(() => expect(screen.getByText('mode: demo')).toBeInTheDocument());
    expect(screen.getByText('scheduling: not offered')).toBeInTheDocument();
    expect(scheduling.rows).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Leave demo' }));
    await waitFor(() => expect(screen.getByText('scheduling: offered')).toBeInTheDocument());
  });

  it('is nothing at all with nobody signed in', () => {
    function Alone() {
      return <span>scheduling: {useScheduling() ? 'offered' : 'not offered'}</span>;
    }
    render(<Alone />);
    expect(screen.getByText('scheduling: not offered')).toBeInTheDocument();
  });
});
